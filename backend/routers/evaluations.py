from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, Field
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
from ..services.feedback_service import generate_and_store_feedback
from .auth import get_current_user

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


class EvaluationCreate(BaseModel):
    title: str
    subject: Optional[str] = None
    description: Optional[str] = None
    duration: int = 30
    status: str = "draft"
    questions: Optional[List[QuestionSchema]] = None


class EvaluationRead(BaseModel):
    id: int
    title: str
    subject: Optional[str]
    description: Optional[str]
    duration: int
    status: str
    response_count: int = 0
    questions: List[QuestionRead] = []
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    access_code: Optional[str] = None
    public_link_id: Optional[str] = None

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
    questions: List[QuestionRead]


class PublicStartBody(BaseModel):
    session_token: Optional[str] = Field(default=None, max_length=40)


class PublicStartRead(BaseModel):
    session_token: str
    seconds_remaining: int
    duration_minutes: int
    questions: List[QuestionRead]


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


def _shuffle_evaluation_questions_for_student(read: EvaluationRead, user_id: int) -> EvaluationRead:
    seed_str = f"student:{user_id}:{read.id}"
    shuffled = _deterministic_shuffle(list(read.questions), seed_str)
    return read.model_copy(update={"questions": shuffled})


def _public_shuffled_question_reads(ev: Evaluation, session_token: str) -> List[QuestionRead]:
    seed_str = f"guest:{session_token}:{ev.id}"
    ordered = sorted(ev.questions, key=lambda q: q.order)
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


def _public_seconds_remaining(started_at: datetime, duration_minutes: int) -> int:
    """Seconds left for a public exam session (server clock)."""
    mins = max(1, int(duration_minutes or 1))
    total = mins * 60
    now = datetime.now(timezone.utc)
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    elapsed = (now - started_at).total_seconds()
    return max(0, int(total - elapsed))


async def _build_evaluation_read(
    session: AsyncSession, ev: Evaluation, *, include_access_secrets: bool = False
) -> EvaluationRead:
    count_result = await session.execute(
        select(func.count(Response.id)).where(Response.evaluation_id == ev.id)
    )
    response_count = count_result.scalar() or 0

    author_name = None
    if ev.author_id:
        author_result = await session.execute(select(User.full_name).where(User.id == ev.author_id))
        author_name = author_result.scalar()

    return EvaluationRead(
        id=ev.id,
        title=ev.title,
        subject=ev.subject,
        description=ev.description,
        duration=ev.duration,
        status=ev.status,
        response_count=response_count,
        author_id=ev.author_id,
        author_name=author_name,
        access_code=ev.access_code if include_access_secrets else None,
        public_link_id=ev.public_link_id if include_access_secrets else None,
        questions=[
            QuestionRead(
                id=q.id,
                order=q.order,
                question_type=q.question_type,
                text=q.text,
                options=q.options,
                correct_answer=q.correct_answer,
                points=q.points,
            )
            for q in sorted(ev.questions, key=lambda q: q.order)
        ],
    )


async def _sync_questions(session: AsyncSession, evaluation: Evaluation, questions_data: List[QuestionSchema]):
    existing_ids = {q.id for q in evaluation.questions}
    incoming_ids = {q.id for q in questions_data if q.id}

    for q in list(evaluation.questions):
        if q.id not in incoming_ids:
            await session.delete(q)

    for idx, q_data in enumerate(questions_data):
        if q_data.id and q_data.id in existing_ids:
            result = await session.execute(select(Question).where(Question.id == q_data.id))
            existing_q = result.scalar_one_or_none()
            if existing_q:
                existing_q.order = idx
                existing_q.question_type = q_data.question_type
                existing_q.text = q_data.text
                existing_q.options = q_data.options
                existing_q.correct_answer = q_data.correct_answer
                existing_q.points = q_data.points
        else:
            session.add(
                Question(
                    evaluation_id=evaluation.id,
                    order=idx,
                    question_type=q_data.question_type,
                    text=q_data.text,
                    options=q_data.options,
                    correct_answer=q_data.correct_answer,
                    points=q_data.points,
                )
            )


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
        select(Evaluation)
        .where(Evaluation.access_code == code, Evaluation.status == "active")
        .options(selectinload(Evaluation.questions))
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
    read = await _build_evaluation_read(session, ev, include_access_secrets=False)
    return _shuffle_evaluation_questions_for_student(read, current_user.id)


@router.post("/public/{public_link_id}/start", response_model=PublicStartRead)
async def start_public_evaluation_session(
    public_link_id: str,
    session: AsyncSession = Depends(get_session),
    body: Optional[PublicStartBody] = Body(None),
) -> PublicStartRead:
    body = body or PublicStartBody()
    result = await session.execute(
        select(Evaluation)
        .where(
            Evaluation.public_link_id == public_link_id,
            Evaluation.status == "active",
        )
        .options(selectinload(Evaluation.questions))
    )
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link invalid sau evaluare inactivă.")
    duration_minutes = max(1, int(ev.duration or 1))

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
        sec = _public_seconds_remaining(att.started_at, duration_minutes)
        qs = _public_shuffled_question_reads(ev, att.session_token)
        return PublicStartRead(
            session_token=att.session_token,
            seconds_remaining=sec,
            duration_minutes=duration_minutes,
            questions=qs,
        )

    new_token = str(uuid.uuid4())
    att = PublicEvaluationAttempt(
        evaluation_id=ev.id,
        public_link_id=public_link_id,
        session_token=new_token,
    )
    session.add(att)
    await session.commit()
    await session.refresh(att)
    sec = _public_seconds_remaining(att.started_at, duration_minutes)
    qs = _public_shuffled_question_reads(ev, att.session_token)
    return PublicStartRead(
        session_token=new_token,
        seconds_remaining=sec,
        duration_minutes=duration_minutes,
        questions=qs,
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
    # Întrebările nu sunt incluse aici — ordinea și conținutul se dau doar la /start (per sesiune),
    # ca să nu poată fi citite înainte de începerea examenului.
    return PublicEvaluationRead(
        id=ev.id,
        title=ev.title,
        subject=ev.subject,
        description=ev.description,
        duration=ev.duration,
        questions=[],
    )


@router.post("/public/{public_link_id}/answer", response_model=FeedbackResponse)
async def submit_public_answer(
    public_link_id: str,
    body: PublicAnswerBody,
    session: AsyncSession = Depends(get_session),
) -> FeedbackResponse:
    result = await session.execute(
        select(Evaluation)
        .where(
            Evaluation.public_link_id == public_link_id,
            Evaluation.status == "active",
        )
        .options(selectinload(Evaluation.questions))
    )
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link invalid.")
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
    if _public_seconds_remaining(attempt.started_at, duration_minutes) <= 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Timpul pentru această evaluare a expirat.",
        )
    q_result = await session.execute(select(Question).where(Question.id == body.question_id))
    question = q_result.scalar_one_or_none()
    if not question or question.evaluation_id != ev.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Întrebare invalidă.")
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
            .where(Evaluation.status == "active", Evaluation.id.in_(subq))
            .options(selectinload(Evaluation.questions))
            .order_by(Evaluation.created_at.desc())
        )
    else:
        query = (
            select(Evaluation)
            .where(Evaluation.author_id == current_user.id)
            .options(selectinload(Evaluation.questions))
            .order_by(Evaluation.created_at.desc())
        )

    result = await session.execute(query)
    evaluations = result.scalars().all()

    eval_list = []
    for ev in evaluations:
        if current_user.role == UserRole.STUDENT:
            built = await _build_evaluation_read(session, ev, include_access_secrets=False)
            eval_list.append(_shuffle_evaluation_questions_for_student(built, current_user.id))
        else:
            await _ensure_access_code(session, ev)
            eval_list.append(await _build_evaluation_read(session, ev, include_access_secrets=True))

    total = len(eval_list)
    active = sum(1 for e in eval_list if e.status == "active")

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

    result = await session.execute(
        select(EvaluationAttempt).where(
            EvaluationAttempt.user_id == current_user.id,
            EvaluationAttempt.evaluation_id == evaluation_id,
        )
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        attempt = EvaluationAttempt(
            user_id=current_user.id,
            evaluation_id=evaluation_id,
        )
        session.add(attempt)
        await session.commit()
        await session.refresh(attempt)

    now = datetime.now(timezone.utc)
    started = attempt.started_at.replace(tzinfo=timezone.utc) if attempt.started_at.tzinfo is None else attempt.started_at
    elapsed = (now - started).total_seconds()
    total = evaluation.duration * 60
    remaining = max(0, int(total - elapsed))

    return AttemptRead(started_at=started, seconds_remaining=remaining)


# Sub-routes with extra path segments MUST be registered before GET /{evaluation_id}
# so proxies and Starlette routing resolve them reliably.


@router.post("/{evaluation_id}/regenerate-access-code", response_model=EvaluationRead)
async def regenerate_access_code(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    result = await session.execute(
        select(Evaluation)
        .where(Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id)
        .options(selectinload(Evaluation.questions))
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
        select(Evaluation)
        .where(Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id)
        .options(selectinload(Evaluation.questions))
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
    evaluation = Evaluation(
        title=data.title,
        subject=data.subject,
        description=data.description,
        duration=data.duration,
        status=data.status,
        author_id=current_user.id,
    )
    session.add(evaluation)
    await session.flush()

    if data.questions:
        for idx, q in enumerate(data.questions):
            session.add(
                Question(
                    evaluation_id=evaluation.id,
                    order=idx,
                    question_type=q.question_type,
                    text=q.text,
                    options=q.options,
                    correct_answer=q.correct_answer,
                    points=q.points,
                )
            )

    await _ensure_access_code(session, evaluation)
    await session.commit()

    result = await session.execute(
        select(Evaluation).where(Evaluation.id == evaluation.id).options(selectinload(Evaluation.questions))
    )
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

    result = await session.execute(query.options(selectinload(Evaluation.questions)))
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
    read = await _build_evaluation_read(session, evaluation, include_access_secrets=include_secrets)
    if current_user.role == UserRole.STUDENT:
        read = _shuffle_evaluation_questions_for_student(read, current_user.id)
    return read


@router.put("/{evaluation_id}", response_model=EvaluationRead)
async def update_evaluation(
    evaluation_id: int,
    data: EvaluationCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    result = await session.execute(
        select(Evaluation)
        .where(Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id)
        .options(selectinload(Evaluation.questions))
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

    evaluation.title = data.title
    evaluation.subject = data.subject
    evaluation.description = data.description
    evaluation.duration = data.duration
    evaluation.status = data.status

    if data.questions is not None:
        await _sync_questions(session, evaluation, data.questions)

    await session.commit()

    result = await session.execute(
        select(Evaluation).where(Evaluation.id == evaluation.id).options(selectinload(Evaluation.questions))
    )
    evaluation = result.scalar_one()
    await _ensure_access_code(session, evaluation)
    await session.commit()
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
