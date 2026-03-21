from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from ..models import Evaluation, EvaluationEnrollment, Question, User
from ..models.user import UserRole
from ..schemas.feedback import FeedbackResponse, ResponseCreate
from ..services.feedback_service import generate_and_store_feedback
from .auth import get_current_user

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("/", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    payload: ResponseCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> FeedbackResponse:
    if not payload.answer.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Răspunsul nu poate fi gol.")

    question = None
    if payload.evaluation_id:
        ev_result = await session.execute(
            select(Evaluation).where(Evaluation.id == payload.evaluation_id)
        )
        evaluation = ev_result.scalar_one_or_none()
        if not evaluation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluarea nu a fost găsită.")
        if evaluation.author_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nu poți răspunde la propria evaluare.",
            )
        if current_user.role == UserRole.STUDENT:
            enr = await session.execute(
                select(EvaluationEnrollment.id).where(
                    EvaluationEnrollment.user_id == current_user.id,
                    EvaluationEnrollment.evaluation_id == payload.evaluation_id,
                )
            )
            if enr.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Nu ești înscris la această evaluare.",
                )

    if payload.question_id:
        q_result = await session.execute(
            select(Question).where(Question.id == payload.question_id)
        )
        question = q_result.scalar_one_or_none()
        if not question:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Întrebarea nu a fost găsită.")

    try:
        return await generate_and_store_feedback(
            session,
            answer=payload.answer,
            mode=payload.mode,
            evaluation_id=payload.evaluation_id,
            question_id=payload.question_id,
            question=question,
            user=current_user,
            rubric=payload.rubric,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


