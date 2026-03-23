from __future__ import annotations

import enum
from typing import List, Optional

from sqlalchemy import Enum, LargeBinary, String
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
    full_name: Mapped[Optional[str]] = mapped_column(String(255))
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.STUDENT, nullable=False)
    avatar_mime: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    avatar_content: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)

    evaluations: Mapped[List["Evaluation"]] = relationship(back_populates="author", cascade="all, delete")
    responses: Mapped[List["Response"]] = relationship(back_populates="author", cascade="all, delete")


from .evaluation import Evaluation  # noqa: E402  (circular)
from .response import Response  # noqa: E402


