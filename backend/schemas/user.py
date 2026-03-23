from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field

from ..models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    role: UserRole = Field(default=UserRole.STUDENT)


class UserCreate(UserBase):
    password: str = Field(min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(UserBase):
    id: int
    created_at: datetime
    has_avatar: bool = False

    class Config:
        from_attributes = True


def user_to_read(user: Any) -> UserRead:
    """Construiește UserRead fără a expune conținutul avatarului în JSON."""
    return UserRead(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        created_at=user.created_at,
        has_avatar=bool(getattr(user, "avatar_content", None)),
    )


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(None, min_length=6)
