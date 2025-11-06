from __future__ import annotations

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Feedback(TimestampMixin, Base):
    __tablename__ = "feedback_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    response_id: Mapped[int] = mapped_column(ForeignKey("responses.id", ondelete="CASCADE"), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="rule_based", nullable=False)

    response: Mapped["Response"] = relationship(back_populates="feedback_items")


from .response import Response  # noqa: E402


