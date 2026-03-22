from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..feedback_engine import generate_feedback
from ..models import Feedback, Question, Response, User
from ..schemas.feedback import FeedbackItemSchema, FeedbackResponse
from .ai_client import generate_ai_feedback


def _normalize_set(raw: str) -> set[str]:
    if "||" in raw:
        return {s.strip().lower() for s in raw.split("||") if s.strip()}
    return {s.strip().lower() for s in raw.split(",") if s.strip()}


def _auto_correct(answer: str, question: Question) -> tuple[bool, int, list[FeedbackItemSchema]]:
    correct = question.correct_answer or ""
    points = question.points or 0

    if question.question_type == "checkboxes":
        student_set = _normalize_set(answer)
        correct_set = _normalize_set(correct)
        is_correct = student_set == correct_set

        if is_correct:
            score = points
            fb = [FeedbackItemSchema(category="Rezultat", message="Răspuns corect!", source="auto")]
        else:
            correct_chosen = len(student_set & correct_set)
            wrong_chosen = len(student_set - correct_set)
            total_correct = len(correct_set)
            partial = max(0, correct_chosen - wrong_chosen)
            score = round(points * partial / total_correct) if total_correct > 0 else 0

            display_correct = ", ".join(s.strip() for s in correct.replace("||", ",").split(",") if s.strip())
            fb = [FeedbackItemSchema(
                category="Rezultat",
                message=f"Răspuns parțial corect ({correct_chosen}/{total_correct} corecte, {wrong_chosen} greșite). Scor: {score}/{points}. Răspunsul corect era: {display_correct}",
                source="auto",
            )]

        return is_correct, score, fb

    is_correct = answer.strip().lower() == correct.strip().lower()
    score = points if is_correct else 0

    if is_correct:
        fb = [FeedbackItemSchema(category="Rezultat", message="Răspuns corect!", source="auto")]
    else:
        display_correct = ", ".join(s.strip() for s in correct.replace("||", ",").split(",") if s.strip())
        fb = [FeedbackItemSchema(
            category="Rezultat",
            message=f"Răspuns greșit. Răspunsul corect era: {display_correct}",
            source="auto",
        )]

    return is_correct, score, fb


async def generate_and_store_feedback(
    session: AsyncSession,
    *,
    answer: str,
    mode: str = "rule_based",
    evaluation_id: Optional[int] = None,
    question_id: Optional[int] = None,
    question: Optional[Question] = None,
    user: Optional[User] = None,
    guest_name: Optional[str] = None,
    guest_class: Optional[str] = None,
    public_session_token: Optional[str] = None,
    rubric: Optional[Iterable[str]] = None,
) -> FeedbackResponse:
    is_correct: Optional[bool] = None
    score: Optional[int] = None

    can_auto = (
        question is not None
        and question.question_type in ("multiple_choice", "checkboxes")
        and question.correct_answer
    )

    if can_auto:
        mode = "auto"

    response = Response(
        answer_text=answer,
        evaluation_id=evaluation_id,
        question_id=question_id,
        user_id=user.id if user else None,
        guest_name=guest_name,
        guest_class=guest_class,
        public_session_token=public_session_token,
        mode=mode,
    )
    session.add(response)
    await session.flush()

    if can_auto:
        is_correct, score, feedback_items = _auto_correct(answer, question)
        response.score = score
    elif mode == "ai":
        q_type = question.question_type if question else None
        q_text = question.text if question else None
        max_points = question.points if question else None
        ai_result = await generate_ai_feedback(
            answer,
            rubric=rubric,
            question_type=q_type,
            question_text=q_text,
            max_points=max_points,
        )
        feedback_items = ai_result.feedback
        score = ai_result.score
        if score is not None:
            response.score = score
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
    return FeedbackResponse(
        response_id=response.id,
        score=score,
        is_correct=is_correct,
        feedback=feedback_items,
    )


