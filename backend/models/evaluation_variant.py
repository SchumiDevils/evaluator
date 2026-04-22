from __future__ import annotations

from typing import List, Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class EvaluationVariant(TimestampMixin, Base):
    __tablename__ = "evaluation_variants"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    evaluation_id: Mapped[int] = mapped_column(
        ForeignKey("evaluations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(100), nullable=False, default="Varianta 1")

    evaluation: Mapped["Evaluation"] = relationship(back_populates="variants")
    questions: Mapped[List["Question"]] = relationship(
        back_populates="variant",
        cascade="all, delete-orphan",
        order_by="Question.order",
    )


from .evaluation import Evaluation  # noqa: E402
from .question import Question  # noqa: E402
