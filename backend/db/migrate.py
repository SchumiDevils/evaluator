"""SQLite column / data migrations after create_all."""

from __future__ import annotations

import secrets
import string
from typing import Any

from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import AsyncConnection


def _sync_migrate(sync_conn: Any) -> None:
    insp = inspect(sync_conn)
    if insp.has_table("evaluations"):
        ev_cols = {c["name"] for c in insp.get_columns("evaluations")}
        if "access_code" not in ev_cols:
            sync_conn.execute(text("ALTER TABLE evaluations ADD COLUMN access_code VARCHAR(20)"))
        if "public_link_id" not in ev_cols:
            sync_conn.execute(text("ALTER TABLE evaluations ADD COLUMN public_link_id VARCHAR(36)"))
        if "scheduled_starts_at" not in ev_cols:
            sync_conn.execute(text("ALTER TABLE evaluations ADD COLUMN scheduled_starts_at TIMESTAMP"))
        if "scheduled_ends_at" not in ev_cols:
            sync_conn.execute(text("ALTER TABLE evaluations ADD COLUMN scheduled_ends_at TIMESTAMP"))
    if insp.has_table("responses"):
        resp_cols = {c["name"] for c in insp.get_columns("responses")}
        if "guest_name" not in resp_cols:
            sync_conn.execute(text("ALTER TABLE responses ADD COLUMN guest_name VARCHAR(255)"))
        if "guest_class" not in resp_cols:
            sync_conn.execute(text("ALTER TABLE responses ADD COLUMN guest_class VARCHAR(100)"))
        if "public_session_token" not in resp_cols:
            sync_conn.execute(text("ALTER TABLE responses ADD COLUMN public_session_token VARCHAR(40)"))
            sync_conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_responses_public_session_question
                    ON responses (evaluation_id, question_id, public_session_token)
                    WHERE public_session_token IS NOT NULL
                    """
                )
            )
            sync_conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_responses_public_session_token ON responses (public_session_token)"
                )
            )
    if not insp.has_table("public_evaluation_attempts"):
        sync_conn.execute(
            text(
                """
                CREATE TABLE public_evaluation_attempts (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    evaluation_id INTEGER NOT NULL,
                    public_link_id VARCHAR(36) NOT NULL,
                    session_token VARCHAR(36) NOT NULL,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(evaluation_id) REFERENCES evaluations (id) ON DELETE CASCADE
                )
                """
            )
        )
        sync_conn.execute(
            text("CREATE UNIQUE INDEX ix_public_evaluation_attempts_session_token ON public_evaluation_attempts (session_token)")
        )
        sync_conn.execute(
            text("CREATE INDEX ix_public_evaluation_attempts_public_link_id ON public_evaluation_attempts (public_link_id)")
        )
        sync_conn.execute(
            text("CREATE INDEX ix_public_evaluation_attempts_evaluation_id ON public_evaluation_attempts (evaluation_id)")
        )
    if insp.has_table("users"):
        user_cols = {c["name"] for c in insp.get_columns("users")}
        if "avatar_mime" not in user_cols:
            sync_conn.execute(text("ALTER TABLE users ADD COLUMN avatar_mime VARCHAR(64)"))
        if "avatar_content" not in user_cols:
            sync_conn.execute(text("ALTER TABLE users ADD COLUMN avatar_content BLOB"))

    # evaluation_variants: creat deja de create_all dacă nu există.
    if insp.has_table("questions"):
        q_cols = {c["name"] for c in insp.get_columns("questions")}
        if "variant_id" not in q_cols:
            sync_conn.execute(text("ALTER TABLE questions ADD COLUMN variant_id INTEGER"))
            sync_conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_questions_variant_id ON questions (variant_id)")
            )
    if insp.has_table("responses"):
        resp_cols2 = {c["name"] for c in insp.get_columns("responses")}
        if "variant_id" not in resp_cols2:
            sync_conn.execute(text("ALTER TABLE responses ADD COLUMN variant_id INTEGER"))
            sync_conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_responses_variant_id ON responses (variant_id)")
            )
    if insp.has_table("evaluation_attempts"):
        att_cols = {c["name"] for c in insp.get_columns("evaluation_attempts")}
        if "variant_id" not in att_cols:
            sync_conn.execute(text("ALTER TABLE evaluation_attempts ADD COLUMN variant_id INTEGER"))
            sync_conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_evaluation_attempts_variant_id ON evaluation_attempts (variant_id)"
                )
            )
    if insp.has_table("public_evaluation_attempts"):
        patt_cols = {c["name"] for c in insp.get_columns("public_evaluation_attempts")}
        if "variant_id" not in patt_cols:
            sync_conn.execute(
                text("ALTER TABLE public_evaluation_attempts ADD COLUMN variant_id INTEGER")
            )
            sync_conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_public_evaluation_attempts_variant_id ON public_evaluation_attempts (variant_id)"
                )
            )


async def run_schema_migrations(conn: AsyncConnection) -> None:
    await conn.run_sync(_sync_migrate)


async def backfill_evaluation_access_and_enrollments(session: Any) -> None:
    """Legacy: enroll students who already had responses; assign codes to old evaluations."""
    from sqlalchemy.ext.asyncio import AsyncSession

    assert isinstance(session, AsyncSession)
    from ..models import Evaluation

    await session.execute(
        text(
            """
            INSERT OR IGNORE INTO evaluation_enrollments (user_id, evaluation_id)
            SELECT DISTINCT user_id, evaluation_id FROM responses
            WHERE user_id IS NOT NULL AND evaluation_id IS NOT NULL
            """
        )
    )

    result = await session.execute(select(Evaluation).where(Evaluation.access_code.is_(None)))
    for ev in result.scalars().all():
        code = generate_access_code()
        for _ in range(20):
            exists = await session.execute(select(Evaluation.id).where(Evaluation.access_code == code))
            if exists.scalar_one_or_none() is None:
                break
            code = generate_access_code()
        ev.access_code = code
    await session.flush()

    await _backfill_variants(session)


async def _backfill_variants(session: Any) -> None:
    """Creează câte o 'Varianta 1' per evaluare care n-are încă variante
    și migrează întrebările + răspunsurile + attempturile existente în ea."""
    from sqlalchemy.ext.asyncio import AsyncSession

    assert isinstance(session, AsyncSession)

    result = await session.execute(
        text(
            """
            SELECT e.id FROM evaluations e
            WHERE NOT EXISTS (
                SELECT 1 FROM evaluation_variants v WHERE v.evaluation_id = e.id
            )
            """
        )
    )
    eval_ids = [row[0] for row in result.all()]
    for eid in eval_ids:
        ins = await session.execute(
            text(
                """
                INSERT INTO evaluation_variants (evaluation_id, "order", name, created_at, updated_at)
                VALUES (:eid, 0, 'Varianta 1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """
            ),
            {"eid": eid},
        )
        variant_id = ins.lastrowid
        await session.execute(
            text(
                "UPDATE questions SET variant_id = :vid WHERE evaluation_id = :eid AND variant_id IS NULL"
            ),
            {"vid": variant_id, "eid": eid},
        )
        await session.execute(
            text(
                "UPDATE responses SET variant_id = :vid WHERE evaluation_id = :eid AND variant_id IS NULL"
            ),
            {"vid": variant_id, "eid": eid},
        )
        await session.execute(
            text(
                "UPDATE evaluation_attempts SET variant_id = :vid WHERE evaluation_id = :eid AND variant_id IS NULL"
            ),
            {"vid": variant_id, "eid": eid},
        )
        await session.execute(
            text(
                "UPDATE public_evaluation_attempts SET variant_id = :vid WHERE evaluation_id = :eid AND variant_id IS NULL"
            ),
            {"vid": variant_id, "eid": eid},
        )
    await session.flush()


def generate_access_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))
