from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import Response as HttpPdfResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.migrate import generate_access_code
from ..db.session import get_session
from ..models import (
    Evaluation,
    EvaluationAttempt,
    EvaluationEnrollment,
    EvaluationVariant,
    Feedback,
    PublicEvaluationAttempt,
    Question,
    Response,
    User,
)
from ..models.user import UserRole
from ..schemas.feedback import (
    FeedbackItemSchema,
    FeedbackResponse,
    ProfessorFeedbackUpdate,
    ResponseRead,
)
from ..services.evaluation_access import (
    exam_seconds_remaining,
    lifecycle_enrichment,
    schedule_block_kind,
    schedule_blocks_access,
    should_reset_attempt_start,
    student_may_access_evaluation,
)
from ..services.evaluation_pdf import build_evaluation_results_pdf
from ..services.feedback_service import generate_and_store_feedback
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


# --- Schemas ---

class QuestionSchema(BaseModel):
    id: Optional[int] = None
    order: int = 0
    question_type: str = "long_answer"
    text: str
    options: Optional[list] = None
    correct_answer: Optional[str] = None
    points: int = 10


class QuestionRead(QuestionSchema):
    id: int

    class Config:
        from_attributes = True


class VariantCreate(BaseModel):
    name: Optional[str] = None
    questions: Optional[List[QuestionSchema]] = None


class VariantUpdate(BaseModel):
    name: Optional[str] = None
    questions: Optional[List[QuestionSchema]] = None


class VariantSummary(BaseModel):
    id: int
    order: int
    name: str
    question_count: int

    class Config:
        from_attributes = True


class VariantRead(BaseModel):
    id: int
    order: int
    name: str
    questions: List[QuestionRead] = []

    class Config:
        from_attributes = True


class EvaluationCreate(BaseModel):
    title: str
    subject: Optional[str] = None
    description: Optional[str] = None
    duration: int = 30
    status: str = "draft"
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    scheduled_starts_at: Optional[datetime] = None
    scheduled_ends_at: Optional[datetime] = None
    # Legacy: single list of questions; wrapped into "Varianta 1" automatically.
    questions: Optional[List[QuestionSchema]] = None
    # New: multiple variants.
    variants: Optional[List[VariantCreate]] = None

    @model_validator(mode="after")
    def validate_schedule(self) -> "EvaluationCreate":
        s = self.start_at if self.start_at is not None else self.scheduled_starts_at
        e = self.end_at if self.end_at is not None else self.scheduled_ends_at
        if s is not None and e is not None:
            if s.tzinfo is None:
                s = s.replace(tzinfo=timezone.utc)
            if e.tzinfo is None:
                e = e.replace(tzinfo=timezone.utc)
            if e <= s:
                raise ValueError("Data și ora de sfârșit trebuie să fie după început.")
        return self


class EvaluationRead(BaseModel):
    id: int
    title: str
    subject: Optional[str]
    description: Optional[str]
    duration: int
    status: str
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    scheduled_starts_at: Optional[datetime] = None
    scheduled_ends_at: Optional[datetime] = None
    lifecycle_status: str = "draft"
    server_now: Optional[datetime] = None
    seconds_until_start: Optional[int] = None
    seconds_until_end: Optional[int] = None
    question_count: int = 0
    schedule_access_blocked: bool = False
    schedule_block_message: Optional[str] = None
    schedule_block_kind: Optional[str] = None
    response_count: int = 0
    questions: List[QuestionRead] = []
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    access_code: Optional[str] = None
    public_link_id: Optional[str] = None
    variants: List[VariantSummary] = []
    variant_count: int = 0
    assigned_variant_id: Optional[int] = None
    requires_start: bool = False

    class Config:
        from_attributes = True


class JoinByCodeBody(BaseModel):
    code: str = Field(..., min_length=4, max_length=20)


class PublicLinkBody(BaseModel):
    enabled: bool


class PublicEvaluationRead(BaseModel):
    id: int
    title: str
    subject: Optional[str]
    description: Optional[str]
    duration: int
    questions: List[QuestionRead] = []
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    scheduled_starts_at: Optional[datetime] = None
    scheduled_ends_at: Optional[datetime] = None
    lifecycle_status: str = "draft"
    server_now: Optional[datetime] = None
    seconds_until_start: Optional[int] = None
    seconds_until_end: Optional[int] = None
    question_count: int = 0
    schedule_access_blocked: bool = False
    schedule_block_kind: Optional[str] = None
    schedule_block_message: Optional[str] = None


class PublicStartBody(BaseModel):
    session_token: Optional[str] = Field(default=None, max_length=40)


class PublicStartRead(BaseModel):
    session_token: str
    seconds_remaining: int
    duration_minutes: int
    server_now: datetime
    questions: List[QuestionRead]
    variant_id: Optional[int] = None


class PublicAnswerBody(BaseModel):
    question_id: int
    answer: str
    session_token: str = Field(..., min_length=32, max_length=40)
    guest_name: str = Field(..., min_length=1, max_length=255)
    guest_class: str = Field(default="", max_length=100)
    mode: str = Field(default="rule_based", pattern="^(rule_based|ai|auto)$")


class StatsRead(BaseModel):
    total: int
    active: int
    responses: int
    avgScore: int


class EvaluationsListResponse(BaseModel):
    evaluations: List[EvaluationRead]
    stats: StatsRead


class MyResponseRead(BaseModel):
    id: int
    evaluation_id: Optional[int]
    evaluation_title: Optional[str] = None
    variant_id: Optional[int] = None
    question_id: Optional[int]
    question_text: Optional[str] = None
    question_points: Optional[int] = None
    answer_text: str
    score: Optional[int]
    mode: str
    created_at: datetime
    feedback: List[FeedbackItemSchema]

    class Config:
        from_attributes = True


# --- Helpers ---


def _fnv1a32(seed_str: str) -> int:
    """FNV-1a 32-bit — același algoritm ca pe frontend pentru seed determinist."""
    h = 2166136261
    for byte in seed_str.encode("utf-8"):
        h ^= byte
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _deterministic_shuffle(items: List[Any], seed_str: str) -> List[Any]:
    """Fisher–Yates cu Mulberry32 (compatibil cu frontend)."""
    state = _fnv1a32(seed_str)
    out = list(items)

    def rand() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61)))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    for i in range(len(out) - 1, 0, -1):
        j = min(i, int(rand() * (i + 1)))
        out[i], out[j] = out[j], out[i]
    return out


def _shuffle_evaluation_questions_for_student(
    read: EvaluationRead, user_id: int, variant_id: Optional[int]
) -> EvaluationRead:
    seed_str = f"student:{user_id}:{read.id}:{variant_id or 'none'}"
    shuffled = _deterministic_shuffle(list(read.questions), seed_str)
    return read.model_copy(update={"questions": shuffled})


def _public_shuffled_question_reads(
    questions: List[Question], session_token: str, evaluation_id: int
) -> List[QuestionRead]:
    seed_str = f"guest:{session_token}:{evaluation_id}"
    ordered = sorted(questions, key=lambda q: q.order)
    items = [
        QuestionRead(
            id=q.id,
            order=q.order,
            question_type=q.question_type,
            text=q.text,
            options=q.options,
            correct_answer=None,
            points=q.points,
        )
        for q in ordered
    ]
    return _deterministic_shuffle(items, seed_str)


async def _ensure_access_code(session: AsyncSession, ev: Evaluation) -> None:
    if ev.access_code:
        return
    for _ in range(30):
        code = generate_access_code()
        exists = await session.execute(select(Evaluation.id).where(Evaluation.access_code == code))
        if exists.scalar_one_or_none() is None:
            ev.access_code = code
            await session.flush()
            return
    raise HTTPException(status_code=500, detail="Nu s-a putut genera codul de acces.")


async def _student_enrolled(session: AsyncSession, user_id: int, evaluation_id: int) -> bool:
    r = await session.execute(
        select(EvaluationEnrollment.id).where(
            EvaluationEnrollment.user_id == user_id,
            EvaluationEnrollment.evaluation_id == evaluation_id,
        )
    )
    return r.scalar_one_or_none() is not None


def _public_feedback_response_from_response(resp: Response) -> FeedbackResponse:
    return FeedbackResponse(
        response_id=resp.id,
        score=resp.score,
        is_correct=None,
        feedback=[
            FeedbackItemSchema(category=f.category, message=f.message, source=f.source)
            for f in resp.feedback_items
        ],
    )


async def _load_variants_for_evaluation(
    session: AsyncSession, evaluation_id: int
) -> List[EvaluationVariant]:
    result = await session.execute(
        select(EvaluationVariant)
        .where(EvaluationVariant.evaluation_id == evaluation_id)
        .options(selectinload(EvaluationVariant.questions))
        .order_by(EvaluationVariant.order, EvaluationVariant.id)
    )
    return list(result.scalars().all())


def _variant_summaries(variants: List[EvaluationVariant]) -> List[VariantSummary]:
    return [
        VariantSummary(id=v.id, order=v.order, name=v.name, question_count=len(v.questions))
        for v in variants
    ]


def _variant_question_reads(variant: EvaluationVariant) -> List[QuestionRead]:
    return [
        QuestionRead(
            id=q.id,
            order=q.order,
            question_type=q.question_type,
            text=q.text,
            options=q.options,
            correct_answer=q.correct_answer,
            points=q.points,
        )
        for q in sorted(variant.questions, key=lambda q: q.order)
    ]


async def _build_evaluation_read(
    session: AsyncSession,
    ev: Evaluation,
    *,
    include_access_secrets: bool = False,
    include_correct_answers: bool = True,
    assigned_variant: Optional[EvaluationVariant] = None,
    now: Optional[datetime] = None,
) -> EvaluationRead:
    """Construiește EvaluationRead.

    Dacă `assigned_variant` e setat, `questions` va conține întrebările acelei variante
    (pentru studenți). Altfel `questions` rămâne gol — profesorul vede lista de variante
    și le încarcă individual prin endpointurile dedicate.
    """
    now = now or datetime.now(timezone.utc)
    count_result = await session.execute(
        select(func.count(Response.id)).where(Response.evaluation_id == ev.id)
    )
    response_count = count_result.scalar() or 0

    author_name = None
    if ev.author_id:
        author_result = await session.execute(select(User.full_name).where(User.id == ev.author_id))
        author_name = author_result.scalar()

    variants = await _load_variants_for_evaluation(session, ev.id)
    summaries = _variant_summaries(variants)

    q_reads: List[QuestionRead] = []
    if assigned_variant is not None:
        for q in sorted(assigned_variant.questions, key=lambda q: q.order):
            q_reads.append(
                QuestionRead(
                    id=q.id,
                    order=q.order,
                    question_type=q.question_type,
                    text=q.text,
                    options=q.options,
                    correct_answer=q.correct_answer if include_correct_answers else None,
                    points=q.points,
                )
            )

    # Pentru a afișa în dashboard / listări un număr reprezentativ chiar înainte
    # de atribuirea variantei, folosim prima variantă (toate variantele ar trebui
    # să aibă aceeași dificultate; dacă diferă ușor, rămâne o estimare).
    display_question_count = (
        len(q_reads) if assigned_variant is not None else (len(variants[0].questions) if variants else 0)
    )

    lc_extra = lifecycle_enrichment(ev, now)
    return EvaluationRead(
        id=ev.id,
        title=ev.title,
        subject=ev.subject,
        description=ev.description,
        duration=ev.duration,
        status=ev.status,
        start_at=ev.scheduled_starts_at,
        end_at=ev.scheduled_ends_at,
        scheduled_starts_at=ev.scheduled_starts_at,
        scheduled_ends_at=ev.scheduled_ends_at,
        lifecycle_status=lc_extra["lifecycle_status"],
        server_now=lc_extra["server_now"],
        seconds_until_start=lc_extra["seconds_until_start"],
        seconds_until_end=lc_extra["seconds_until_end"],
        question_count=display_question_count,
        response_count=response_count,
        author_id=ev.author_id,
        author_name=author_name,
        access_code=ev.access_code if include_access_secrets else None,
        public_link_id=ev.public_link_id if include_access_secrets else None,
        questions=q_reads,
        variants=summaries,
        variant_count=len(summaries),
        assigned_variant_id=assigned_variant.id if assigned_variant else None,
    )


def _apply_student_schedule_gate(read: EvaluationRead, ev: Evaluation, now: datetime) -> EvaluationRead:
    """Studenți: ascunde întrebările în afara ferestrei de programare (nu leak înainte de start)."""
    n = len(read.questions)
    if student_may_access_evaluation(ev, now):
        return read.model_copy(
            update={
                "question_count": n,
                "schedule_access_blocked": False,
                "schedule_block_message": None,
                "schedule_block_kind": None,
            }
        )
    kind = schedule_block_kind(ev, now)
    msg = schedule_blocks_access(ev, now) or "Evaluarea nu este disponibilă în acest moment."
    return read.model_copy(
        update={
            "questions": [],
            "question_count": n,
            "schedule_access_blocked": True,
            "schedule_block_message": msg,
            "schedule_block_kind": kind,
        }
    )


async def _sync_variant_questions(
    session: AsyncSession, variant: EvaluationVariant, questions_data: List[QuestionSchema]
) -> None:
    """Sincronizează întrebările unei variante (creează/șterge/actualizează)."""
    existing_ids = {q.id for q in variant.questions}
    incoming_ids = {q.id for q in questions_data if q.id}

    for q in list(variant.questions):
        if q.id not in incoming_ids:
            await session.delete(q)

    for idx, q_data in enumerate(questions_data):
        if q_data.id and q_data.id in existing_ids:
            result = await session.execute(select(Question).where(Question.id == q_data.id))
            existing_q = result.scalar_one_or_none()
            if existing_q:
                existing_q.variant_id = variant.id
                existing_q.evaluation_id = variant.evaluation_id
                existing_q.order = idx
                existing_q.question_type = q_data.question_type
                existing_q.text = q_data.text
                existing_q.options = q_data.options
                existing_q.correct_answer = q_data.correct_answer
                existing_q.points = q_data.points
        else:
            session.add(
                Question(
                    evaluation_id=variant.evaluation_id,
                    variant_id=variant.id,
                    order=idx,
                    question_type=q_data.question_type,
                    text=q_data.text,
                    options=q_data.options,
                    correct_answer=q_data.correct_answer,
                    points=q_data.points,
                )
            )


async def _next_variant_order(session: AsyncSession, evaluation_id: int) -> int:
    result = await session.execute(
        select(func.coalesce(func.max(EvaluationVariant.order), -1)).where(
            EvaluationVariant.evaluation_id == evaluation_id
        )
    )
    current = result.scalar() or -1
    return int(current) + 1


async def _ensure_at_least_one_variant(
    session: AsyncSession, evaluation: Evaluation
) -> EvaluationVariant:
    """Garantează că evaluarea are cel puțin o variantă (creează 'Varianta 1' la nevoie)."""
    result = await session.execute(
        select(EvaluationVariant)
        .where(EvaluationVariant.evaluation_id == evaluation.id)
        .order_by(EvaluationVariant.order, EvaluationVariant.id)
        .limit(1)
    )
    v = result.scalar_one_or_none()
    if v is not None:
        return v
    v = EvaluationVariant(evaluation_id=evaluation.id, order=0, name="Varianta 1")
    session.add(v)
    await session.flush()
    return v


async def _get_student_assigned_variant(
    session: AsyncSession, user_id: int, evaluation_id: int
) -> Optional[EvaluationVariant]:
    """Returnează varianta atribuită studentului pe attempt (sau None dacă n-a făcut /start)."""
    result = await session.execute(
        select(EvaluationAttempt).where(
            EvaluationAttempt.user_id == user_id,
            EvaluationAttempt.evaluation_id == evaluation_id,
        )
    )
    att = result.scalar_one_or_none()
    if not att or not att.variant_id:
        return None
    v_result = await session.execute(
        select(EvaluationVariant)
        .where(EvaluationVariant.id == att.variant_id)
        .options(selectinload(EvaluationVariant.questions))
    )
    return v_result.scalar_one_or_none()


# --- Routes ---


@router.post("/join", response_model=EvaluationRead)
async def join_evaluation_by_code(
    body: JoinByCodeBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doar studenții pot folosi codul.")
    code = body.code.strip().upper()
    result = await session.execute(
        select(Evaluation).where(
            Evaluation.access_code == code, Evaluation.status == "active"
        )
    )
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cod invalid sau evaluare inactivă.")
    existing = await session.execute(
        select(EvaluationEnrollment.id).where(
            EvaluationEnrollment.user_id == current_user.id,
            EvaluationEnrollment.evaluation_id == ev.id,
        )
    )
    if existing.scalar_one_or_none() is None:
        session.add(
            EvaluationEnrollment(user_id=current_user.id, evaluation_id=ev.id)
        )
        await session.commit()
        await session.refresh(ev)
    assigned_variant = await _get_student_assigned_variant(session, current_user.id, ev.id)
    read = await _build_evaluation_read(
        session, ev, include_access_secrets=False, assigned_variant=assigned_variant
    )
    if assigned_variant is None:
        read = read.model_copy(update={"requires_start": True})
    read = _apply_student_schedule_gate(read, ev, datetime.now(timezone.utc))
    if not read.schedule_access_blocked and assigned_variant is not None:
        read = _shuffle_evaluation_questions_for_student(read, current_user.id, assigned_variant.id)
    return read


@router.post("/public/{public_link_id}/start", response_model=PublicStartRead)
async def start_public_evaluation_session(
    public_link_id: str,
    session: AsyncSession = Depends(get_session),
    body: Optional[PublicStartBody] = Body(None),
) -> PublicStartRead:
    body = body or PublicStartBody()
    result = await session.execute(
        select(Evaluation).where(
            Evaluation.public_link_id == public_link_id,
            Evaluation.status == "active",
        )
    )
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link invalid sau evaluare inactivă.")
    now = datetime.now(timezone.utc)
    denied = schedule_blocks_access(ev, now)
    if denied:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=denied)
    duration_minutes = max(1, int(ev.duration or 1))

    variants = await _load_variants_for_evaluation(session, ev.id)
    if not variants:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluarea nu conține variante.",
        )
    variants_by_id = {v.id: v for v in variants}

    token_in = (body.session_token or "").strip() or None
    if token_in:
        att_r = await session.execute(
            select(PublicEvaluationAttempt).where(
                PublicEvaluationAttempt.session_token == token_in,
                PublicEvaluationAttempt.public_link_id == public_link_id,
                PublicEvaluationAttempt.evaluation_id == ev.id,
            )
        )
        att = att_r.scalar_one_or_none()
        if not att:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sesiune invalidă sau expirată. Reîncarcă pagina pentru o sesiune nouă.",
            )
        if att.variant_id is None or att.variant_id not in variants_by_id:
            att.variant_id = random.choice(variants).id
        if should_reset_attempt_start(att.started_at, ev.scheduled_starts_at, now):
            att.started_at = now
        await session.commit()
        await session.refresh(att)
        chosen = variants_by_id[att.variant_id]
        sec = exam_seconds_remaining(att.started_at, duration_minutes, now, ev.scheduled_ends_at)
        qs = _public_shuffled_question_reads(chosen.questions, att.session_token, ev.id)
        return PublicStartRead(
            session_token=att.session_token,
            seconds_remaining=sec,
            duration_minutes=duration_minutes,
            server_now=now,
            questions=qs,
            variant_id=chosen.id,
        )

    new_token = str(uuid.uuid4())
    chosen = random.choice(variants)
    att = PublicEvaluationAttempt(
        evaluation_id=ev.id,
        public_link_id=public_link_id,
        session_token=new_token,
        variant_id=chosen.id,
    )
    session.add(att)
    await session.commit()
    await session.refresh(att)
    sec = exam_seconds_remaining(att.started_at, duration_minutes, now, ev.scheduled_ends_at)
    qs = _public_shuffled_question_reads(chosen.questions, att.session_token, ev.id)
    return PublicStartRead(
        session_token=new_token,
        seconds_remaining=sec,
        duration_minutes=duration_minutes,
        server_now=now,
        questions=qs,
        variant_id=chosen.id,
    )


@router.get("/public/{public_link_id}", response_model=PublicEvaluationRead)
async def get_public_evaluation(
    public_link_id: str,
    session: AsyncSession = Depends(get_session),
) -> PublicEvaluationRead:
    result = await session.execute(
        select(Evaluation).where(
            Evaluation.public_link_id == public_link_id,
            Evaluation.status == "active",
        )
    )
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link invalid sau evaluare inactivă.")
    now = datetime.now(timezone.utc)

    variants = await _load_variants_for_evaluation(session, ev.id)
    # Afișăm ca număr de întrebări pe cea mai mare variantă (aproximativ).
    nq = max((len(v.questions) for v in variants), default=0)
    open_now = student_may_access_evaluation(ev, now)
    kind = schedule_block_kind(ev, now) if not open_now else None
    msg = schedule_blocks_access(ev, now) if not open_now else None
    lc = lifecycle_enrichment(ev, now)
    return PublicEvaluationRead(
        id=ev.id,
        title=ev.title,
        subject=ev.subject,
        description=ev.description,
        duration=ev.duration,
        questions=[],
        start_at=ev.scheduled_starts_at,
        end_at=ev.scheduled_ends_at,
        scheduled_starts_at=ev.scheduled_starts_at,
        scheduled_ends_at=ev.scheduled_ends_at,
        lifecycle_status=lc["lifecycle_status"],
        server_now=lc["server_now"],
        seconds_until_start=lc["seconds_until_start"],
        seconds_until_end=lc["seconds_until_end"],
        question_count=nq,
        schedule_access_blocked=not open_now,
        schedule_block_kind=kind,
        schedule_block_message=msg,
    )


@router.post("/public/{public_link_id}/answer", response_model=FeedbackResponse)
async def submit_public_answer(
    public_link_id: str,
    body: PublicAnswerBody,
    session: AsyncSession = Depends(get_session),
) -> FeedbackResponse:
    result = await session.execute(
        select(Evaluation).where(
            Evaluation.public_link_id == public_link_id,
            Evaluation.status == "active",
        )
    )
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link invalid.")
    now = datetime.now(timezone.utc)
    denied = schedule_blocks_access(ev, now)
    if denied:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=denied)
    duration_minutes = max(1, int(ev.duration or 1))
    att_r = await session.execute(
        select(PublicEvaluationAttempt).where(
            PublicEvaluationAttempt.session_token == body.session_token.strip(),
            PublicEvaluationAttempt.public_link_id == public_link_id,
            PublicEvaluationAttempt.evaluation_id == ev.id,
        )
    )
    attempt = att_r.scalar_one_or_none()
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sesiune invalidă. Reîncarcă pagina și începe din nou.",
        )
    if exam_seconds_remaining(attempt.started_at, duration_minutes, now, ev.scheduled_ends_at) <= 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Timpul pentru această evaluare a expirat.",
        )
    q_result = await session.execute(select(Question).where(Question.id == body.question_id))
    question = q_result.scalar_one_or_none()
    if not question or question.evaluation_id != ev.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Întrebare invalidă.")
    if attempt.variant_id is not None and question.variant_id != attempt.variant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Întrebarea nu aparține variantei atribuite acestei sesiuni.",
        )
    session_token_norm = body.session_token.strip()
    existing_r = await session.execute(
        select(Response)
        .where(
            Response.evaluation_id == ev.id,
            Response.question_id == body.question_id,
            Response.public_session_token == session_token_norm,
        )
        .options(selectinload(Response.feedback_items))
    )
    existing = existing_r.scalar_one_or_none()
    if existing:
        return _public_feedback_response_from_response(existing)
    try:
        return await generate_and_store_feedback(
            session,
            answer=body.answer,
            mode=body.mode,
            evaluation_id=ev.id,
            question_id=body.question_id,
            question=question,
            user=None,
            guest_name=body.guest_name.strip(),
            guest_class=body.guest_class.strip() or None,
            public_session_token=session_token_norm,
        )
    except IntegrityError:
        await session.rollback()
        retry_r = await session.execute(
            select(Response)
            .where(
                Response.evaluation_id == ev.id,
                Response.question_id == body.question_id,
                Response.public_session_token == session_token_norm,
            )
            .options(selectinload(Response.feedback_items))
        )
        retry = retry_r.scalar_one_or_none()
        if retry:
            return _public_feedback_response_from_response(retry)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Răspunsul nu a putut fi salvat. Reîncearcă.",
        ) from None
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/", response_model=EvaluationsListResponse)
async def list_evaluations(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationsListResponse:
    if current_user.role == UserRole.STUDENT:
        subq = select(EvaluationEnrollment.evaluation_id).where(
            EvaluationEnrollment.user_id == current_user.id
        )
        query = (
            select(Evaluation)
            .where(
                Evaluation.status == "active",
                Evaluation.id.in_(subq),
            )
            .order_by(Evaluation.created_at.desc())
        )
    else:
        query = (
            select(Evaluation)
            .where(Evaluation.author_id == current_user.id)
            .order_by(Evaluation.created_at.desc())
        )

    result = await session.execute(query)
    evaluations = result.scalars().all()

    eval_list: List[EvaluationRead] = []
    now_student_gate = datetime.now(timezone.utc)
    for ev in evaluations:
        if current_user.role == UserRole.STUDENT:
            assigned_variant = await _get_student_assigned_variant(session, current_user.id, ev.id)
            built = await _build_evaluation_read(
                session,
                ev,
                include_access_secrets=False,
                assigned_variant=assigned_variant,
                now=now_student_gate,
            )
            if assigned_variant is None:
                built = built.model_copy(update={"requires_start": True})
            built = _apply_student_schedule_gate(built, ev, now_student_gate)
            if not built.schedule_access_blocked and assigned_variant is not None:
                built = _shuffle_evaluation_questions_for_student(
                    built, current_user.id, assigned_variant.id
                )
            eval_list.append(built)
        else:
            await _ensure_access_code(session, ev)
            eval_list.append(
                await _build_evaluation_read(
                    session, ev, include_access_secrets=True, now=now_student_gate
                )
            )

    total = len(eval_list)
    active = sum(1 for ev in evaluations if student_may_access_evaluation(ev, now_student_gate))

    if current_user.role == UserRole.STUDENT:
        own_count_result = await session.execute(
            select(func.count(Response.id)).where(Response.user_id == current_user.id)
        )
        total_responses = own_count_result.scalar() or 0

        avg_result = await session.execute(
            select(func.avg(Response.score)).where(
                Response.user_id == current_user.id,
                Response.score.isnot(None),
            )
        )
        raw_avg = avg_result.scalar()

        if raw_avg is not None:
            max_result = await session.execute(
                select(func.sum(Question.points)).where(
                    Question.id.in_(
                        select(Response.question_id).where(
                            Response.user_id == current_user.id,
                            Response.score.isnot(None),
                            Response.question_id.isnot(None),
                        )
                    )
                )
            )
            total_points = max_result.scalar() or 0

            score_sum_result = await session.execute(
                select(func.sum(Response.score)).where(
                    Response.user_id == current_user.id,
                    Response.score.isnot(None),
                )
            )
            score_sum = score_sum_result.scalar() or 0
            avg_score = round(score_sum * 100 / total_points) if total_points > 0 else 0
        else:
            avg_score = 0
    else:
        total_responses = sum(e.response_count for e in eval_list)

        eval_ids = [ev.id for ev in evaluations]
        if eval_ids:
            avg_result = await session.execute(
                select(func.sum(Response.score), func.sum(Question.points)).where(
                    Response.evaluation_id.in_(eval_ids),
                    Response.score.isnot(None),
                    Response.question_id == Question.id,
                )
            )
            row = avg_result.one()
            score_sum = row[0] or 0
            total_points = row[1] or 0
            avg_score = round(score_sum * 100 / total_points) if total_points > 0 else 0
        else:
            avg_score = 0

    if current_user.role != UserRole.STUDENT:
        await session.commit()

    return EvaluationsListResponse(
        evaluations=eval_list,
        stats=StatsRead(total=total, active=active, responses=total_responses, avgScore=avg_score),
    )


@router.get("/my-responses", response_model=List[MyResponseRead])
async def list_my_responses(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> List[MyResponseRead]:
    result = await session.execute(
        select(Response)
        .where(Response.user_id == current_user.id)
        .options(
            selectinload(Response.feedback_items),
            selectinload(Response.evaluation),
            selectinload(Response.question),
        )
        .order_by(Response.created_at.desc())
    )
    responses = result.scalars().all()

    return [
        MyResponseRead(
            id=r.id,
            evaluation_id=r.evaluation_id,
            evaluation_title=r.evaluation.title if r.evaluation else None,
            variant_id=r.variant_id,
            question_id=r.question_id,
            question_text=r.question.text if r.question else None,
            question_points=r.question.points if r.question else None,
            answer_text=r.answer_text,
            score=r.score,
            mode=r.mode,
            created_at=r.created_at,
            feedback=[
                FeedbackItemSchema(category=fb.category, message=fb.message, source=fb.source)
                for fb in r.feedback_items
            ],
        )
        for r in responses
    ]


class AttemptRead(BaseModel):
    started_at: datetime
    seconds_remaining: int
    server_now: datetime
    variant_id: Optional[int] = None

    class Config:
        from_attributes = True


@router.post("/{evaluation_id}/start", response_model=AttemptRead)
async def start_evaluation(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AttemptRead:
    ev_result = await session.execute(
        select(Evaluation).where(Evaluation.id == evaluation_id)
    )
    evaluation = ev_result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluarea nu a fost găsită.")

    if current_user.role == UserRole.STUDENT:
        if not await _student_enrolled(session, current_user.id, evaluation_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nu ești înscris la această evaluare. Folosește codul de acces.",
            )
        denied = schedule_blocks_access(evaluation, datetime.now(timezone.utc))
        if denied:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=denied)

    variants = await _load_variants_for_evaluation(session, evaluation_id)
    if not variants:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Evaluarea nu are nicio variantă configurată.",
        )
    variants_by_id = {v.id: v for v in variants}

    result = await session.execute(
        select(EvaluationAttempt).where(
            EvaluationAttempt.user_id == current_user.id,
            EvaluationAttempt.evaluation_id == evaluation_id,
        )
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        chosen = random.choice(variants)
        attempt = EvaluationAttempt(
            user_id=current_user.id,
            evaluation_id=evaluation_id,
            variant_id=chosen.id,
        )
        session.add(attempt)
        await session.commit()
        await session.refresh(attempt)
    elif attempt.variant_id is None or attempt.variant_id not in variants_by_id:
        attempt.variant_id = random.choice(variants).id
        await session.commit()
        await session.refresh(attempt)

    now = datetime.now(timezone.utc)
    if should_reset_attempt_start(attempt.started_at, evaluation.scheduled_starts_at, now):
        attempt.started_at = now
        await session.commit()
        await session.refresh(attempt)

    started = (
        attempt.started_at.replace(tzinfo=timezone.utc)
        if attempt.started_at.tzinfo is None
        else attempt.started_at
    )
    remaining = exam_seconds_remaining(started, evaluation.duration, now, evaluation.scheduled_ends_at)

    return AttemptRead(
        started_at=started,
        seconds_remaining=remaining,
        server_now=now,
        variant_id=attempt.variant_id,
    )


# --- Sub-routes (variants, access-code, etc.) înainte de GET /{evaluation_id} ---


@router.get("/{evaluation_id}/variants", response_model=List[VariantSummary])
async def list_variants(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> List[VariantSummary]:
    ev_result = await session.execute(
        select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )
    )
    if not ev_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
    variants = await _load_variants_for_evaluation(session, evaluation_id)
    return _variant_summaries(variants)


@router.get("/{evaluation_id}/variants/{variant_id}", response_model=VariantRead)
async def get_variant(
    evaluation_id: int,
    variant_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> VariantRead:
    ev_result = await session.execute(
        select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )
    )
    if not ev_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
    v_result = await session.execute(
        select(EvaluationVariant)
        .where(
            EvaluationVariant.id == variant_id,
            EvaluationVariant.evaluation_id == evaluation_id,
        )
        .options(selectinload(EvaluationVariant.questions))
    )
    variant = v_result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
    return VariantRead(
        id=variant.id,
        order=variant.order,
        name=variant.name,
        questions=_variant_question_reads(variant),
    )


@router.post(
    "/{evaluation_id}/variants",
    response_model=VariantRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_variant(
    evaluation_id: int,
    body: VariantCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> VariantRead:
    ev_result = await session.execute(
        select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )
    )
    evaluation = ev_result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
    order = await _next_variant_order(session, evaluation_id)
    name = (body.name or "").strip() or f"Varianta {order + 1}"
    variant = EvaluationVariant(
        evaluation_id=evaluation_id,
        order=order,
        name=name,
    )
    session.add(variant)
    await session.flush()

    if body.questions:
        for idx, q in enumerate(body.questions):
            session.add(
                Question(
                    evaluation_id=evaluation_id,
                    variant_id=variant.id,
                    order=idx,
                    question_type=q.question_type,
                    text=q.text,
                    options=q.options,
                    correct_answer=q.correct_answer,
                    points=q.points,
                )
            )
    await session.commit()

    v_result = await session.execute(
        select(EvaluationVariant)
        .where(EvaluationVariant.id == variant.id)
        .options(selectinload(EvaluationVariant.questions))
    )
    variant = v_result.scalar_one()
    return VariantRead(
        id=variant.id,
        order=variant.order,
        name=variant.name,
        questions=_variant_question_reads(variant),
    )


@router.put("/{evaluation_id}/variants/{variant_id}", response_model=VariantRead)
async def update_variant(
    evaluation_id: int,
    variant_id: int,
    body: VariantUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> VariantRead:
    ev_result = await session.execute(
        select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )
    )
    if not ev_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
    v_result = await session.execute(
        select(EvaluationVariant)
        .where(
            EvaluationVariant.id == variant_id,
            EvaluationVariant.evaluation_id == evaluation_id,
        )
        .options(selectinload(EvaluationVariant.questions))
    )
    variant = v_result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
    if body.name is not None:
        stripped = body.name.strip()
        if stripped:
            variant.name = stripped
    if body.questions is not None:
        await _sync_variant_questions(session, variant, body.questions)
    await session.commit()

    v_result = await session.execute(
        select(EvaluationVariant)
        .where(EvaluationVariant.id == variant.id)
        .options(selectinload(EvaluationVariant.questions))
    )
    variant = v_result.scalar_one()
    return VariantRead(
        id=variant.id,
        order=variant.order,
        name=variant.name,
        questions=_variant_question_reads(variant),
    )


@router.delete("/{evaluation_id}/variants/{variant_id}")
async def delete_variant(
    evaluation_id: int,
    variant_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ev_result = await session.execute(
        select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )
    )
    if not ev_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
    count_result = await session.execute(
        select(func.count(EvaluationVariant.id)).where(
            EvaluationVariant.evaluation_id == evaluation_id
        )
    )
    total = count_result.scalar() or 0
    if total <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Evaluarea trebuie să aibă cel puțin o variantă.",
        )
    v_result = await session.execute(
        select(EvaluationVariant).where(
            EvaluationVariant.id == variant_id,
            EvaluationVariant.evaluation_id == evaluation_id,
        )
    )
    variant = v_result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
    await session.delete(variant)
    await session.commit()
    return {"deleted": True}


@router.post("/{evaluation_id}/regenerate-access-code", response_model=EvaluationRead)
async def regenerate_access_code(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    result = await session.execute(
        select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
    for _ in range(30):
        code = generate_access_code()
        exists = await session.execute(
            select(Evaluation.id).where(Evaluation.access_code == code, Evaluation.id != evaluation.id)
        )
        if exists.scalar_one_or_none() is None:
            evaluation.access_code = code
            break
    await session.commit()
    return await _build_evaluation_read(session, evaluation, include_access_secrets=True)


@router.put("/{evaluation_id}/public-link", response_model=EvaluationRead)
async def toggle_public_link(
    evaluation_id: int,
    body: PublicLinkBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    result = await session.execute(
        select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
    await _ensure_access_code(session, evaluation)
    if body.enabled:
        if not evaluation.public_link_id:
            evaluation.public_link_id = str(uuid.uuid4())
    else:
        evaluation.public_link_id = None
    await session.commit()
    return await _build_evaluation_read(session, evaluation, include_access_secrets=True)


@router.get("/{evaluation_id}/responses", response_model=List[ResponseRead])
async def list_evaluation_responses(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> List[ResponseRead]:
    ev_result = await session.execute(
        select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )
    )
    if not ev_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

    result = await session.execute(
        select(Response)
        .where(Response.evaluation_id == evaluation_id)
        .options(selectinload(Response.feedback_items), selectinload(Response.author))
        .order_by(Response.created_at.desc())
    )
    responses = result.scalars().all()

    def _display_name(resp: Response) -> Optional[str]:
        if resp.author and resp.author.full_name:
            return resp.author.full_name
        if resp.guest_name:
            return f"{resp.guest_name}" + (f" ({resp.guest_class})" if resp.guest_class else "") + " [Guest]"
        return None

    return [
        ResponseRead(
            id=r.id,
            answer_text=r.answer_text,
            evaluation_id=r.evaluation_id,
            variant_id=r.variant_id,
            question_id=r.question_id,
            score=r.score,
            mode=r.mode,
            user_id=r.user_id,
            user_name=_display_name(r),
            guest_name=r.guest_name,
            guest_class=r.guest_class,
            created_at=r.created_at,
            feedback=[
                FeedbackItemSchema(
                    category=fb.category, message=fb.message, source=fb.source
                )
                for fb in r.feedback_items
            ],
        )
        for r in responses
    ]


def _participant_key(resp: Response) -> str:
    if resp.user_id is not None:
        return f"u-{resp.user_id}"
    gn = (resp.guest_name or "").strip()
    gc = (resp.guest_class or "").strip()
    return f"g-{gn}|{gc}"


@router.get("/{evaluation_id}/export/pdf")
async def export_evaluation_pdf(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> HttpPdfResponse:
    """Profesorul care deține evaluarea exportă toate răspunsurile ca PDF."""
    ev_result = await session.execute(
        select(Evaluation)
        .where(Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id)
        .options(selectinload(Evaluation.questions))
    )
    evaluation = ev_result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

    variants = await _load_variants_for_evaluation(session, evaluation_id)
    variant_name_by_id = {v.id: v.name for v in variants}

    result = await session.execute(
        select(Response)
        .where(Response.evaluation_id == evaluation_id)
        .options(selectinload(Response.feedback_items), selectinload(Response.author))
        .order_by(Response.created_at.desc())
    )
    responses = result.scalars().all()

    # Folosim toate întrebările (din toate variantele) pentru mapare.
    all_questions: List[Question] = []
    for v in variants:
        all_questions.extend(v.questions)
    q_by_id = {q.id: q for q in all_questions}
    # Numerotarea exercițiilor se face per variantă.
    ex_num_by_qid: dict[int, int] = {}
    for v in variants:
        ordered = sorted(v.questions, key=lambda q: q.order)
        for i, q in enumerate(ordered):
            ex_num_by_qid[q.id] = i + 1

    def _display_name(resp: Response) -> Optional[str]:
        if resp.author and resp.author.full_name:
            return resp.author.full_name
        if resp.guest_name:
            return f"{resp.guest_name}" + (f" ({resp.guest_class})" if resp.guest_class else "") + " [Guest]"
        return None

    groups: dict[str, list[Response]] = {}
    key_order: list[str] = []
    for r in responses:
        key = _participant_key(r)
        if key not in groups:
            groups[key] = []
            key_order.append(key)
        groups[key].append(r)

    grouped_students: list[dict[str, Any]] = []
    for key in key_order:
        rs = groups[key]
        name = _display_name(rs[0]) or "Participant"
        # Varianta afișată: luăm cea mai frecventă (în mod normal e una singură per participant).
        variant_ids = [r.variant_id for r in rs if r.variant_id is not None]
        variant_label: Optional[str] = None
        if variant_ids:
            most_common = max(set(variant_ids), key=variant_ids.count)
            variant_label = variant_name_by_id.get(most_common)

        def _sort_key(resp: Response) -> tuple[int, int]:
            q = q_by_id.get(resp.question_id)
            return (q.order if q else 999999, resp.id)

        sorted_rs = sorted(rs, key=_sort_key)
        total_score = 0
        max_score = 0
        student_rows: list[dict[str, Any]] = []
        for r in sorted_rs:
            q = q_by_id.get(r.question_id)
            if q:
                max_score += q.points
            if r.score is not None:
                total_score += r.score
            student_rows.append(
                {
                    "ex_index": ex_num_by_qid.get(r.question_id, "?"),
                    "question_text": q.text if q else "Întrebare necunoscută",
                    "answer_text": r.answer_text,
                    "score": r.score,
                    "points": q.points if q else None,
                    "feedback": [
                        {"category": fb.category, "message": fb.message, "source": fb.source}
                        for fb in r.feedback_items
                    ],
                }
            )
        grouped_students.append(
            {
                "name": name + (f" — {variant_label}" if variant_label else ""),
                "responses": student_rows,
                "total_score": total_score if sorted_rs else None,
                "max_score": max_score if max_score else None,
            }
        )

    exported_at = datetime.now(timezone.utc)
    try:
        pdf_bytes = build_evaluation_results_pdf(
            title=evaluation.title,
            subject=evaluation.subject,
            description=evaluation.description,
            professor_name=current_user.full_name,
            exported_at=exported_at,
            grouped_students=grouped_students,
        )
    except Exception as exc:
        logger.exception("export/pdf failed for evaluation_id=%s", evaluation_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Generarea PDF a eșuat pe server.",
        ) from exc

    safe_name = f"evaluare-{evaluation_id}.pdf"
    return HttpPdfResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


# --- Per-evaluation analytics schemas ---

class EvalAnalyticsSummary(BaseModel):
    total_participants: int = 0
    total_responses: int = 0
    avg_score_percent: float = 0
    max_score_percent: float = 0
    min_score_percent: float = 0


class EvalScoreBucket(BaseModel):
    range: str
    count: int


class EvalQuestionSuccess(BaseModel):
    question_id: int
    question_text: str
    question_type: str
    avg_percent: float
    total_responses: int


class EvalStudentScore(BaseModel):
    name: str
    total_score: int
    max_points: int
    percent: float
    variant_id: Optional[int] = None
    variant_name: Optional[str] = None


class EvalVariantBreakdown(BaseModel):
    variant_id: int
    variant_name: str
    summary: EvalAnalyticsSummary
    score_distribution: List[EvalScoreBucket]
    question_success: List[EvalQuestionSuccess]
    student_scores: List[EvalStudentScore]


class EvalAnalyticsResponse(BaseModel):
    summary: EvalAnalyticsSummary
    score_distribution: List[EvalScoreBucket]
    question_success: List[EvalQuestionSuccess]
    student_scores: List[EvalStudentScore]
    per_variant: List[EvalVariantBreakdown] = []


def _empty_distribution() -> List[EvalScoreBucket]:
    buckets_order = ["0-19%", "20-39%", "40-59%", "60-79%", "80-99%", "100%"]
    return [EvalScoreBucket(range=b, count=0) for b in buckets_order]


def _compute_analytics(
    rows: list,
    user_names: dict[int, str],
    variant_name_by_id: dict[int, str],
) -> tuple[
    EvalAnalyticsSummary,
    List[EvalScoreBucket],
    List[EvalQuestionSuccess],
    List[EvalStudentScore],
]:
    from collections import defaultdict

    if not rows:
        return (
            EvalAnalyticsSummary(),
            _empty_distribution(),
            [],
            [],
        )

    participants: dict[str, dict] = {}
    question_stats: dict[int, dict] = defaultdict(
        lambda: {"text": "", "type": "", "total_score": 0, "total_points": 0, "count": 0}
    )

    for r in rows:
        if r.user_id is not None:
            pkey = f"u-{r.user_id}"
            pname = None
        else:
            gn = (r.guest_name or "").strip()
            gc = (r.guest_class or "").strip()
            pkey = f"g-{gn}|{gc}|{r.public_session_token or ''}"
            pname = gn + (f" ({gc})" if gc else "")

        if pkey not in participants:
            participants[pkey] = {
                "name": pname,
                "user_id": r.user_id,
                "total_score": 0,
                "max_points": 0,
                "variant_id": r.variant_id,
            }
        participants[pkey]["total_score"] += r.score or 0
        participants[pkey]["max_points"] += r.points or 0

        qs = question_stats[r.qid]
        qs["text"] = r.qtext
        qs["type"] = r.question_type
        qs["total_score"] += r.score or 0
        qs["total_points"] += r.points or 0
        qs["count"] += 1

    student_scores: List[EvalStudentScore] = []
    percents: list[float] = []
    for p in participants.values():
        name = p["name"] if p["name"] else user_names.get(p["user_id"], f"User #{p['user_id']}")
        pct = round(p["total_score"] * 100 / p["max_points"], 1) if p["max_points"] > 0 else 0
        percents.append(pct)
        student_scores.append(
            EvalStudentScore(
                name=name,
                total_score=p["total_score"],
                max_points=p["max_points"],
                percent=pct,
                variant_id=p["variant_id"],
                variant_name=variant_name_by_id.get(p["variant_id"]) if p["variant_id"] else None,
            )
        )

    student_scores.sort(key=lambda s: s.percent, reverse=True)

    summary = EvalAnalyticsSummary(
        total_participants=len(participants),
        total_responses=len(rows),
        avg_score_percent=round(sum(percents) / len(percents), 1) if percents else 0,
        max_score_percent=max(percents) if percents else 0,
        min_score_percent=min(percents) if percents else 0,
    )

    buckets_order = ["0-19%", "20-39%", "40-59%", "60-79%", "80-99%", "100%"]
    bucket_counts: dict[str, int] = {b: 0 for b in buckets_order}
    for pct in percents:
        if pct < 20:
            bucket_counts["0-19%"] += 1
        elif pct < 40:
            bucket_counts["20-39%"] += 1
        elif pct < 60:
            bucket_counts["40-59%"] += 1
        elif pct < 80:
            bucket_counts["60-79%"] += 1
        elif pct < 100:
            bucket_counts["80-99%"] += 1
        else:
            bucket_counts["100%"] += 1

    score_distribution = [EvalScoreBucket(range=b, count=bucket_counts[b]) for b in buckets_order]

    question_success: List[EvalQuestionSuccess] = []
    for qid in sorted(question_stats.keys()):
        qs = question_stats[qid]
        avg_pct = round(qs["total_score"] * 100 / qs["total_points"], 1) if qs["total_points"] > 0 else 0
        question_success.append(
            EvalQuestionSuccess(
                question_id=qid,
                question_text=qs["text"][:80],
                question_type=qs["type"],
                avg_percent=avg_pct,
                total_responses=qs["count"],
            )
        )

    return summary, score_distribution, question_success, student_scores


@router.get("/{evaluation_id}/analytics", response_model=EvalAnalyticsResponse)
async def get_evaluation_analytics(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvalAnalyticsResponse:
    ev_result = await session.execute(
        select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )
    )
    if not ev_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

    variants = await _load_variants_for_evaluation(session, evaluation_id)
    variant_name_by_id = {v.id: v.name for v in variants}

    resp_result = await session.execute(
        select(
            Response.id,
            Response.score,
            Response.user_id,
            Response.guest_name,
            Response.guest_class,
            Response.public_session_token,
            Response.variant_id,
            Question.points,
            Question.id.label("qid"),
            Question.text.label("qtext"),
            Question.question_type,
        ).where(
            Response.evaluation_id == evaluation_id,
            Response.score.isnot(None),
            Response.question_id == Question.id,
            Question.points > 0,
        )
    )
    rows = resp_result.all()

    user_ids: list[int] = []
    for r in rows:
        if r.user_id is not None:
            user_ids.append(r.user_id)
    user_names: dict[int, str] = {}
    if user_ids:
        users_result = await session.execute(
            select(User.id, User.full_name).where(User.id.in_(user_ids))
        )
        user_names = {uid: name or f"User #{uid}" for uid, name in users_result.all()}

    summary, distribution, q_success, students = _compute_analytics(
        rows, user_names, variant_name_by_id
    )

    per_variant: List[EvalVariantBreakdown] = []
    for v in variants:
        v_rows = [r for r in rows if r.variant_id == v.id]
        v_summary, v_dist, v_qsuccess, v_students = _compute_analytics(
            v_rows, user_names, variant_name_by_id
        )
        per_variant.append(
            EvalVariantBreakdown(
                variant_id=v.id,
                variant_name=v.name,
                summary=v_summary,
                score_distribution=v_dist,
                question_success=v_qsuccess,
                student_scores=v_students,
            )
        )

    return EvalAnalyticsResponse(
        summary=summary,
        score_distribution=distribution,
        question_success=q_success,
        student_scores=students,
        per_variant=per_variant,
    )


@router.get("/{evaluation_id}/my-responses", response_model=List[ResponseRead])
async def list_my_evaluation_responses(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> List[ResponseRead]:
    ev_result = await session.execute(
        select(Evaluation).where(Evaluation.id == evaluation_id)
    )
    evaluation = ev_result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

    if current_user.role == UserRole.STUDENT and evaluation.status != "active":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

    if current_user.role == UserRole.STUDENT:
        if not await _student_enrolled(session, current_user.id, evaluation_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nu ești înscris la această evaluare.",
            )

    result = await session.execute(
        select(Response)
        .where(Response.evaluation_id == evaluation_id, Response.user_id == current_user.id)
        .options(selectinload(Response.feedback_items), selectinload(Response.author))
        .order_by(Response.created_at.desc())
    )
    responses = result.scalars().all()

    return [
        ResponseRead(
            id=r.id,
            answer_text=r.answer_text,
            evaluation_id=r.evaluation_id,
            variant_id=r.variant_id,
            question_id=r.question_id,
            score=r.score,
            mode=r.mode,
            user_id=r.user_id,
            user_name=r.author.full_name if r.author else None,
            guest_name=r.guest_name,
            guest_class=r.guest_class,
            created_at=r.created_at,
            feedback=[
                FeedbackItemSchema(
                    category=fb.category, message=fb.message, source=fb.source
                )
                for fb in r.feedback_items
            ],
        )
        for r in responses
    ]


@router.post("/", response_model=EvaluationRead, status_code=status.HTTP_201_CREATED)
async def create_evaluation(
    data: EvaluationCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    start_val = data.start_at if data.start_at is not None else data.scheduled_starts_at
    end_val = data.end_at if data.end_at is not None else data.scheduled_ends_at
    evaluation = Evaluation(
        title=data.title,
        subject=data.subject,
        description=data.description,
        duration=data.duration,
        status=data.status,
        scheduled_starts_at=start_val,
        scheduled_ends_at=end_val,
        author_id=current_user.id,
    )
    session.add(evaluation)
    await session.flush()

    # Construim lista finală de variante de creat.
    variants_to_create: List[VariantCreate] = []
    if data.variants:
        variants_to_create.extend(data.variants)
    elif data.questions:
        variants_to_create.append(VariantCreate(name="Varianta 1", questions=data.questions))
    else:
        variants_to_create.append(VariantCreate(name="Varianta 1", questions=[]))

    for idx, v_data in enumerate(variants_to_create):
        vname = (v_data.name or "").strip() or f"Varianta {idx + 1}"
        variant = EvaluationVariant(
            evaluation_id=evaluation.id,
            order=idx,
            name=vname,
        )
        session.add(variant)
        await session.flush()
        if v_data.questions:
            for qidx, q in enumerate(v_data.questions):
                session.add(
                    Question(
                        evaluation_id=evaluation.id,
                        variant_id=variant.id,
                        order=qidx,
                        question_type=q.question_type,
                        text=q.text,
                        options=q.options,
                        correct_answer=q.correct_answer,
                        points=q.points,
                    )
                )

    await _ensure_access_code(session, evaluation)
    await session.commit()

    result = await session.execute(select(Evaluation).where(Evaluation.id == evaluation.id))
    evaluation = result.scalar_one()
    return await _build_evaluation_read(session, evaluation, include_access_secrets=True)


@router.get("/{evaluation_id}", response_model=EvaluationRead)
async def get_evaluation(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    if current_user.role == UserRole.STUDENT:
        query = select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.status == "active"
        )
    else:
        query = select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )

    result = await session.execute(query)
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
    if current_user.role == UserRole.STUDENT:
        if not await _student_enrolled(session, current_user.id, evaluation_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nu ești înscris la această evaluare.",
            )
    include_secrets = (
        current_user.role != UserRole.STUDENT and evaluation.author_id == current_user.id
    )
    if include_secrets:
        await _ensure_access_code(session, evaluation)
        await session.commit()

    assigned_variant: Optional[EvaluationVariant] = None
    if current_user.role == UserRole.STUDENT:
        assigned_variant = await _get_student_assigned_variant(
            session, current_user.id, evaluation_id
        )

    read = await _build_evaluation_read(
        session,
        evaluation,
        include_access_secrets=include_secrets,
        assigned_variant=assigned_variant,
    )
    if current_user.role == UserRole.STUDENT:
        if assigned_variant is None:
            read = read.model_copy(update={"requires_start": True})
        read = _apply_student_schedule_gate(read, evaluation, datetime.now(timezone.utc))
        if not read.schedule_access_blocked and assigned_variant is not None:
            read = _shuffle_evaluation_questions_for_student(
                read, current_user.id, assigned_variant.id
            )
    return read


@router.put("/{evaluation_id}", response_model=EvaluationRead)
async def update_evaluation(
    evaluation_id: int,
    data: EvaluationCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    result = await session.execute(
        select(Evaluation).where(
            Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id
        )
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

    evaluation.title = data.title
    evaluation.subject = data.subject
    evaluation.description = data.description
    evaluation.duration = data.duration
    evaluation.status = data.status
    evaluation.scheduled_starts_at = (
        data.start_at if data.start_at is not None else data.scheduled_starts_at
    )
    evaluation.scheduled_ends_at = data.end_at if data.end_at is not None else data.scheduled_ends_at

    # Variantele se gestionează prin endpointurile dedicate — ignorăm
    # aici câmpurile `questions` / `variants` pentru a nu duplica logica
    # de sincronizare și a evita ștergeri accidentale.

    await _ensure_access_code(session, evaluation)
    await session.commit()

    result = await session.execute(select(Evaluation).where(Evaluation.id == evaluation.id))
    evaluation = result.scalar_one()
    return await _build_evaluation_read(session, evaluation, include_access_secrets=True)


@router.delete("/{evaluation_id}")
async def delete_evaluation(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(Evaluation).where(Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

    await session.delete(evaluation)
    await session.commit()
    return {"deleted": True}


@router.put("/responses/{response_id}/feedback")
async def professor_reevaluate(
    response_id: int,
    payload: ProfessorFeedbackUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    resp_result = await session.execute(
        select(Response)
        .where(Response.id == response_id)
        .options(selectinload(Response.evaluation))
    )
    response = resp_result.scalar_one_or_none()
    if not response:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Response not found")

    if not response.evaluation or response.evaluation.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nu ai permisiunea.")

    if payload.score is not None:
        response.score = payload.score

    if payload.feedback_message:
        session.add(
            Feedback(
                response_id=response.id,
                category="Profesor",
                message=payload.feedback_message,
                source="professor",
            )
        )

    await session.commit()
    return {"updated": True, "score": response.score}
