from __future__ import annotations

from typing import List, Optional

from sqlalchemy import ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Question(TimestampMixin, Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    evaluation_id: Mapped[int] = mapped_column(ForeignKey("evaluations.id", ondelete="CASCADE"), nullable=False)
    variant_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("evaluation_variants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    order: Mapped[int] = mapped_column(Integer, default=0)
    question_type: Mapped[str] = mapped_column(String(30), default="long_answer")
    text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    correct_answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    points: Mapped[int] = mapped_column(Integer, default=10)

    evaluation: Mapped["Evaluation"] = relationship(back_populates="questions")
    variant: Mapped[Optional["EvaluationVariant"]] = relationship(back_populates="questions")


from .evaluation import Evaluation  # noqa: E402
from .evaluation_variant import EvaluationVariant  # noqa: E402
