from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from ..models import Evaluation, Response, User
from .auth import get_current_user

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


class EvaluationCreate(BaseModel):
    title: str
    subject: Optional[str] = None
    description: Optional[str] = None
    duration: int = 30
    status: str = "draft"


class EvaluationRead(BaseModel):
    id: int
    title: str
    subject: Optional[str]
    description: Optional[str]
    duration: int
    status: str
    response_count: int = 0

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


@router.get("/", response_model=EvaluationsListResponse)
async def list_evaluations(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationsListResponse:
    # Get evaluations for this user
    result = await session.execute(
        select(Evaluation).where(Evaluation.author_id == current_user.id).order_by(Evaluation.created_at.desc())
    )
    evaluations = result.scalars().all()

    # Build response with response counts
    eval_list = []
    for ev in evaluations:
        count_result = await session.execute(
            select(func.count(Response.id)).where(Response.evaluation_id == ev.id)
        )
        response_count = count_result.scalar() or 0
        eval_list.append(
            EvaluationRead(
                id=ev.id,
                title=ev.title,
                subject=ev.subject,
                description=ev.description,
                duration=ev.duration,
                status=ev.status,
                response_count=response_count,
            )
        )

    # Calculate stats
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
    await session.commit()
    await session.refresh(evaluation)

    return EvaluationRead(
        id=evaluation.id,
        title=evaluation.title,
        subject=evaluation.subject,
        description=evaluation.description,
        duration=evaluation.duration,
        status=evaluation.status,
        response_count=0,
    )


@router.get("/{evaluation_id}", response_model=EvaluationRead)
async def get_evaluation(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    result = await session.execute(
        select(Evaluation).where(Evaluation.id == evaluation_id, Evaluation.author_id == current_user.id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")

    count_result = await session.execute(
        select(func.count(Response.id)).where(Response.evaluation_id == evaluation.id)
    )
    response_count = count_result.scalar() or 0

    return EvaluationRead(
        id=evaluation.id,
        title=evaluation.title,
        subject=evaluation.subject,
        description=evaluation.description,
        duration=evaluation.duration,
        status=evaluation.status,
        response_count=response_count,
    )


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