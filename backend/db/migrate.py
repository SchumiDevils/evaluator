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
    if insp.has_table("responses"):
        resp_cols = {c["name"] for c in insp.get_columns("responses")}
        if "guest_name" not in resp_cols:
            sync_conn.execute(text("ALTER TABLE responses ADD COLUMN guest_name VARCHAR(255)"))
        if "guest_class" not in resp_cols:
            sync_conn.execute(text("ALTER TABLE responses ADD COLUMN guest_class VARCHAR(100)"))


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


def generate_access_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))
