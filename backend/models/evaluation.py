from __future__ import annotations

from typing import List, Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Evaluation(TimestampMixin, Base):
    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text)
    duration: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    access_code: Mapped[Optional[str]] = mapped_column(String(20), unique=True, index=True, nullable=True)
    public_link_id: Mapped[Optional[str]] = mapped_column(String(36), unique=True, index=True, nullable=True)

    author: Mapped[Optional["User"]] = relationship(back_populates="evaluations")
    responses: Mapped[List["Response"]] = relationship(back_populates="evaluation", cascade="all, delete")
    questions: Mapped[List["Question"]] = relationship(
        back_populates="evaluation", cascade="all, delete-orphan", order_by="Question.order"
    )
    enrollments: Mapped[List["EvaluationEnrollment"]] = relationship(
        back_populates="evaluation", cascade="all, delete-orphan"
    )


from .question import Question  # noqa: E402
from .response import Response  # noqa: E402
from .user import User  # noqa: E402
