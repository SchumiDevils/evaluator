from __future__ import annotations

import enum

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class UserRole(str, enum.Enum):
    PROFESSOR = "professor"
    STUDENT = "student"
    ADMIN = "admin"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.STUDENT, nullable=False)

    evaluations: Mapped[list["Evaluation"]] = relationship(back_populates="author", cascade="all, delete")
    responses: Mapped[list["Response"]] = relationship(back_populates="author", cascade="all, delete")


from .evaluation import Evaluation  # noqa: E402  (circular)
from .response import Response  # noqa: E402


