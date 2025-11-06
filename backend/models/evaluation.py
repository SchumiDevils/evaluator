from __future__ import annotations

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Evaluation(TimestampMixin, Base):
    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    author: Mapped["User | None"] = relationship(back_populates="evaluations")
    responses: Mapped[list["Response"]] = relationship(back_populates="evaluation", cascade="all, delete")


from .response import Response  # noqa: E402
from .user import User  # noqa: E402


