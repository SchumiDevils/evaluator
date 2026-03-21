from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import case, cast, func, select, Float
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from ..models import Evaluation, EvaluationEnrollment, Question, Response, User
from ..models.user import UserRole
from .auth import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


class ScoreBucket(BaseModel):
    range: str
    count: int


class QuestionSuccess(BaseModel):
    question_id: int
    question_text: str
    avg_percent: float
    total_responses: int


class EvaluationAverage(BaseModel):
    evaluation_id: int
    evaluation_title: str
    class_avg_percent: float
    student_avg_percent: Optional[float] = None
    total_students: int


class StudentEvolution(BaseModel):
    evaluation_id: int
    evaluation_title: str
    score_percent: float
    submitted_at: str


class AnalyticsResponse(BaseModel):
    score_distribution: List[ScoreBucket]
    question_success: List[QuestionSuccess]
    evaluation_averages: List[EvaluationAverage]
    student_evolution: Optional[List[StudentEvolution]] = None


@router.get("/", response_model=AnalyticsResponse)
async def get_analytics(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AnalyticsResponse:
    is_student = current_user.role == UserRole.STUDENT

    if is_student:
        subq = select(EvaluationEnrollment.evaluation_id).where(
            EvaluationEnrollment.user_id == current_user.id
        )
        eval_ids_q = select(Evaluation.id).where(
            Evaluation.status == "active",
            Evaluation.id.in_(subq),
        )
    else:
        eval_ids_q = (
            select(Evaluation.id).where(Evaluation.author_id == current_user.id)
        )

    eval_ids_result = await session.execute(eval_ids_q)
    eval_ids = [r[0] for r in eval_ids_result.all()]

    score_distribution = await _score_distribution(session, eval_ids, current_user.id if is_student else None)
    question_success = await _question_success(session, eval_ids)
    evaluation_averages = await _evaluation_averages(
        session, eval_ids, current_user.id if is_student else None
    )
    student_evolution = None
    if is_student:
        student_evolution = await _student_evolution(session, eval_ids, current_user.id)

    return AnalyticsResponse(
        score_distribution=score_distribution,
        question_success=question_success,
        evaluation_averages=evaluation_averages,
        student_evolution=student_evolution,
    )


async def _score_distribution(
    session: AsyncSession, eval_ids: list[int], student_id: int | None
) -> list[ScoreBucket]:
    if not eval_ids:
        return _empty_buckets()

    filters = [
        Response.evaluation_id.in_(eval_ids),
        Response.score.isnot(None),
        Response.question_id == Question.id,
    ]
    if student_id:
        filters.append(Response.user_id == student_id)

    percent_expr = cast(Response.score, Float) * 100.0 / cast(Question.points, Float)

    bucket = case(
        (percent_expr < 20, "0-19%"),
        (percent_expr < 40, "20-39%"),
        (percent_expr < 60, "40-59%"),
        (percent_expr < 80, "60-79%"),
        (percent_expr < 100, "80-99%"),
        else_="100%",
    )

    result = await session.execute(
        select(bucket, func.count()).where(*filters).group_by(bucket)
    )
    rows = {r[0]: r[1] for r in result.all()}

    buckets_order = ["0-19%", "20-39%", "40-59%", "60-79%", "80-99%", "100%"]
    return [ScoreBucket(range=b, count=rows.get(b, 0)) for b in buckets_order]


def _empty_buckets() -> list[ScoreBucket]:
    return [ScoreBucket(range=b, count=0) for b in ["0-19%", "20-39%", "40-59%", "60-79%", "80-99%", "100%"]]


async def _question_success(
    session: AsyncSession, eval_ids: list[int]
) -> list[QuestionSuccess]:
    if not eval_ids:
        return []

    result = await session.execute(
        select(
            Question.id,
            Question.text,
            func.avg(cast(Response.score, Float) * 100.0 / cast(Question.points, Float)),
            func.count(Response.id),
        )
        .where(
            Response.evaluation_id.in_(eval_ids),
            Response.score.isnot(None),
            Response.question_id == Question.id,
            Question.points > 0,
        )
        .group_by(Question.id, Question.text)
        .order_by(Question.id)
    )

    return [
        QuestionSuccess(
            question_id=row[0],
            question_text=row[1][:80],
            avg_percent=round(row[2], 1) if row[2] else 0,
            total_responses=row[3],
        )
        for row in result.all()
    ]


async def _evaluation_averages(
    session: AsyncSession, eval_ids: list[int], student_id: int | None
) -> list[EvaluationAverage]:
    if not eval_ids:
        return []

    evals_result = await session.execute(
        select(Evaluation.id, Evaluation.title).where(Evaluation.id.in_(eval_ids))
    )
    evals = {r[0]: r[1] for r in evals_result.all()}

    output = []
    for eid, title in evals.items():
        class_result = await session.execute(
            select(
                func.sum(Response.score),
                func.sum(Question.points),
                func.count(func.distinct(Response.user_id)),
            ).where(
                Response.evaluation_id == eid,
                Response.score.isnot(None),
                Response.question_id == Question.id,
            )
        )
        crow = class_result.one()
        c_score = crow[0] or 0
        c_points = crow[1] or 0
        c_students = crow[2] or 0
        class_avg = round(c_score * 100 / c_points, 1) if c_points > 0 else 0

        student_avg = None
        if student_id:
            stu_result = await session.execute(
                select(func.sum(Response.score), func.sum(Question.points)).where(
                    Response.evaluation_id == eid,
                    Response.user_id == student_id,
                    Response.score.isnot(None),
                    Response.question_id == Question.id,
                )
            )
            srow = stu_result.one()
            s_score = srow[0] or 0
            s_points = srow[1] or 0
            student_avg = round(s_score * 100 / s_points, 1) if s_points > 0 else None

        output.append(
            EvaluationAverage(
                evaluation_id=eid,
                evaluation_title=title,
                class_avg_percent=class_avg,
                student_avg_percent=student_avg,
                total_students=c_students,
            )
        )

    return output


async def _student_evolution(
    session: AsyncSession, eval_ids: list[int], student_id: int
) -> list[StudentEvolution]:
    if not eval_ids:
        return []

    result = await session.execute(
        select(
            Response.evaluation_id,
            Evaluation.title,
            func.sum(Response.score),
            func.sum(Question.points),
            func.min(Response.created_at),
        )
        .where(
            Response.evaluation_id.in_(eval_ids),
            Response.user_id == student_id,
            Response.score.isnot(None),
            Response.question_id == Question.id,
            Response.evaluation_id == Evaluation.id,
        )
        .group_by(Response.evaluation_id, Evaluation.title)
        .order_by(func.min(Response.created_at))
    )

    return [
        StudentEvolution(
            evaluation_id=row[0],
            evaluation_title=row[1],
            score_percent=round((row[2] or 0) * 100 / row[3], 1) if row[3] and row[3] > 0 else 0,
            submitted_at=row[4].isoformat() if row[4] else "",
        )
        for row in result.all()
    ]
