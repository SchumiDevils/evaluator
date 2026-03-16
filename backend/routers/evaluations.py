from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.session import get_session
from ..models import Evaluation, EvaluationAttempt, Feedback, Question, Response, User
from ..models.user import UserRole
from ..schemas.feedback import (
    FeedbackItemSchema,
    ProfessorFeedbackUpdate,
    ResponseRead,
)
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

    class Config:
        from_attributes = True


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

async def _build_evaluation_read(session: AsyncSession, ev: Evaluation) -> EvaluationRead:
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

@router.get("/", response_model=EvaluationsListResponse)
async def list_evaluations(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationsListResponse:
    if current_user.role == UserRole.STUDENT:
        query = (
            select(Evaluation)
            .where(Evaluation.status == "active")
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
        eval_list.append(await _build_evaluation_read(session, ev))

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

    await session.commit()

    result = await session.execute(
        select(Evaluation).where(Evaluation.id == evaluation.id).options(selectinload(Evaluation.questions))
    )
    evaluation = result.scalar_one()
    return await _build_evaluation_read(session, evaluation)


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
    return await _build_evaluation_read(session, evaluation)


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
    return await _build_evaluation_read(session, evaluation)


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


# --- Student responses for professor ---

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

    # Students can only access active evaluations; professors can inspect their own submissions if any.
    if current_user.role == UserRole.STUDENT and evaluation.status != "active":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

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
