from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..feedback_engine import generate_feedback
from ..models import Feedback, Response, User
from ..schemas.feedback import FeedbackItemSchema, FeedbackResponse
from .ai_client import generate_ai_feedback


async def generate_and_store_feedback(
    session: AsyncSession,
    *,
    answer: str,
    mode: str = "rule_based",
    evaluation_id: int | None = None,
    user: User | None = None,
    rubric: Optional[Iterable[str]] = None,
) -> FeedbackResponse:
    response = Response(
        answer_text=answer,
        evaluation_id=evaluation_id,
        user_id=user.id if user else None,
        mode=mode,
    )
    session.add(response)
    await session.flush()

    if mode == "ai":
        ai_result = await generate_ai_feedback(answer, rubric=rubric)
        feedback_items = ai_result.feedback
        response.token_usage = ai_result.token_usage
    else:
        feedback_items = [item.to_schema() for item in generate_feedback(answer)]

    for item in feedback_items:
        session.add(
            Feedback(
                response_id=response.id,
                category=item.category,
                message=item.message,
                source=item.source,
            )
        )

    await session.commit()
    return FeedbackResponse(response_id=response.id, feedback=feedback_items)


