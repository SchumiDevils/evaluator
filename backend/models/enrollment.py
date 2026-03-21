from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class EvaluationEnrollment(Base):
    __tablename__ = "evaluation_enrollments"
    __table_args__ = (UniqueConstraint("user_id", "evaluation_id", name="uq_enrollment_user_eval"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    evaluation_id: Mapped[int] = mapped_column(ForeignKey("evaluations.id", ondelete="CASCADE"))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[Optional["User"]] = relationship()
    evaluation: Mapped[Optional["Evaluation"]] = relationship()


from .evaluation import Evaluation  # noqa: E402
from .user import User  # noqa: E402
