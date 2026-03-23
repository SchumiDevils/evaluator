from __future__ import annotations

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response as StarletteResponse

from ..core.config import get_settings
from ..core.security import create_access_token, get_password_hash, verify_password
from ..db.session import get_session
from ..models import User, UserRole
from ..schemas.auth import Token
from ..schemas.user import UserCreate, UserProfileUpdate, UserRead, user_to_read

router = APIRouter(prefix="/auth", tags=["auth"])

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")

_MAX_AVATAR_BYTES = 1_500_000
_AVATAR_MIMES = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})


async def _get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    result = await session.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register_user(user_in: UserCreate, session: AsyncSession = Depends(get_session)) -> UserRead:
    existing = await _get_user_by_email(session, user_in.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email deja folosit.")

    user = User(
        email=user_in.email.lower(),
        full_name=user_in.full_name,
        role=user_in.role if isinstance(user_in.role, UserRole) else UserRole(user_in.role),
        hashed_password=get_password_hash(user_in.password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user_to_read(user)


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(get_session)
) -> Token:
    user = await _get_user_by_email(session, form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credențiale invalide.")

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    token = create_access_token(str(user.id), expires_delta=access_token_expires)
    return Token(access_token=token)


async def get_current_user(
    token: str = Depends(oauth2_scheme), session: AsyncSession = Depends(get_session)
) -> User:
    from ..core.security import decode_access_token

    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalid sau expirat.")

    result = await session.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilizator inexistent.")
    return user


@router.get("/me", response_model=UserRead)
async def read_profile(current_user: User = Depends(get_current_user)) -> UserRead:
    return user_to_read(current_user)


@router.patch("/me", response_model=UserRead)
async def update_profile(
    body: UserProfileUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    data = body.model_dump(exclude_unset=True)
    if "full_name" in data:
        fn = data["full_name"]
        current_user.full_name = (fn or "").strip() or None
    if data.get("new_password"):
        if not verify_password(data.get("current_password") or "", current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parola curentă este incorectă.",
            )
        current_user.hashed_password = get_password_hash(data["new_password"])
    await session.commit()
    await session.refresh(current_user)
    return user_to_read(current_user)


@router.get("/me/avatar")
async def get_my_avatar(current_user: User = Depends(get_current_user)) -> StarletteResponse:
    if not current_user.avatar_content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Niciun avatar.")
    return StarletteResponse(
        content=bytes(current_user.avatar_content),
        media_type=current_user.avatar_mime or "application/octet-stream",
    )


@router.post("/me/avatar", response_model=UserRead)
async def upload_my_avatar(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
) -> UserRead:
    content = await file.read()
    if len(content) > _MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fișier prea mare (maximum 1,5 MB).",
        )
    raw_ct = (file.content_type or "").split(";")[0].strip().lower()
    if raw_ct not in _AVATAR_MIMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tip neacceptat. Folosește PNG, JPEG, WebP sau GIF.",
        )
    current_user.avatar_mime = raw_ct
    current_user.avatar_content = content
    await session.commit()
    await session.refresh(current_user)
    return user_to_read(current_user)


@router.delete("/me/avatar", response_model=UserRead)
async def delete_my_avatar(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    current_user.avatar_mime = None
    current_user.avatar_content = None
    await session.commit()
    await session.refresh(current_user)
    return user_to_read(current_user)
