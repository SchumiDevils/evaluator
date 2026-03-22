from __future__ import annotations

from typing import List, Optional

from sqlalchemy import ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Response(TimestampMixin, Base):
    __tablename__ = "responses"
    __table_args__ = (
        Index(
            "uq_responses_public_session_question",
            "evaluation_id",
            "question_id",
            "public_session_token",
            unique=True,
            sqlite_where=text("public_session_token IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    answer_text: Mapped[str] = mapped_column(Text, nullable=False)
    evaluation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("evaluations.id", ondelete="SET NULL"))
    question_id: Mapped[Optional[int]] = mapped_column(ForeignKey("questions.id", ondelete="SET NULL"))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    guest_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    guest_class: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    public_session_token: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    token_usage: Mapped[Optional[int]] = mapped_column(Integer)
    mode: Mapped[str] = mapped_column(String(32), default="rule_based")

    evaluation: Mapped[Optional["Evaluation"]] = relationship(back_populates="responses")
    question: Mapped[Optional["Question"]] = relationship()
    author: Mapped[Optional["User"]] = relationship(back_populates="responses")
    feedback_items: Mapped[List["Feedback"]] = relationship(
        back_populates="response", cascade="all, delete-orphan"
    )


from .evaluation import Evaluation  # noqa: E402
from .feedback import Feedback  # noqa: E402
from .question import Question  # noqa: E402
from .user import User  # noqa: E402


