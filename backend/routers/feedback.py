from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from ..models import User
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

    try:
        return await generate_and_store_feedback(
            session,
            answer=payload.answer,
            mode=payload.mode,
            evaluation_id=payload.evaluation_id,
            user=current_user,
            rubric=payload.rubric,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


