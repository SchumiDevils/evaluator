from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class PublicEvaluationAttempt(Base):
    """Server-side start time for anonymous public exam sessions (timer enforcement)."""

    __tablename__ = "public_evaluation_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    evaluation_id: Mapped[int] = mapped_column(ForeignKey("evaluations.id", ondelete="CASCADE"))
    public_link_id: Mapped[str] = mapped_column(String(36), index=True)
    session_token: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    evaluation: Mapped[Optional["Evaluation"]] = relationship("Evaluation")
