from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.session import get_session
from ..models import Evaluation, Question, Response, User
from ..models.user import UserRole
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
    total_responses = sum(e.response_count for e in eval_list)

    return EvaluationsListResponse(
        evaluations=eval_list,
        stats=StatsRead(total=total, active=active, responses=total_responses, avgScore=0),
    )


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
