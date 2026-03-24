from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response as StarletteResponse

from ..core.config import get_settings
from ..core.security import create_access_token, get_password_hash, verify_password
from ..db.session import get_session
from ..models import PasswordResetToken, User, UserRole
from ..schemas.auth import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    Token,
)
from ..schemas.user import UserCreate, UserProfileUpdate, UserRead, user_to_read
from ..services.email_smtp import send_password_reset_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")

_MAX_AVATAR_BYTES = 1_500_000
_AVATAR_MIMES = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})


async def _get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    result = await session.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


def _send_reset_email_task(to_email: str, reset_url: str) -> None:
    logger.info("forgot-password: attempting to send reset email to %s", to_email)
    try:
        send_password_reset_email(to_email, reset_url, get_settings())
        logger.info("forgot-password: reset email sent to %s", to_email)
    except Exception:
        logger.exception("forgot-password: failed to send reset email to %s", to_email)


def _token_expired(expires_at: datetime) -> bool:
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        return expires_at.replace(tzinfo=timezone.utc) < now
    return expires_at < now


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> MessageResponse:
    """Nu dezvăluie dacă emailul există; trimite email (sau log în dev) dacă există cont."""
    email_norm = body.email.strip().lower()
    logger.info("forgot-password requested for email=%s", email_norm)

    user = await _get_user_by_email(session, email_norm)
    msg = (
        "Dacă există un cont asociat acestui email, vei primi în scurt timp instrucțiuni "
        "pentru resetarea parolei."
    )
    if not user:
        logger.info("forgot-password: no user found for email=%s", email_norm)
        return MessageResponse(message=msg)

    logger.info("forgot-password: user found id=%s email=%s", user.id, user.email)
    logger.info("forgot-password: generating reset token for user id=%s", user.id)

    await session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_token_expire_minutes)
    session.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires))
    await session.commit()

    base = settings.frontend_base_url.rstrip("/")
    reset_url = f"{base}/?reset={raw}"
    logger.info(
        "forgot-password: token saved for user id=%s, queueing email send to %s",
        user.id,
        user.email,
    )
    background_tasks.add_task(_send_reset_email_task, user.email, reset_url)
    return MessageResponse(message=msg)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(body: ResetPasswordRequest, session: AsyncSession = Depends(get_session)) -> MessageResponse:
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    result = await session.execute(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash))
    row = result.scalar_one_or_none()
    invalid_msg = "Linkul de resetare nu este valid sau a expirat. Solicită din nou resetarea parolei."
    if not row or _token_expired(row.expires_at):
        if row:
            await session.delete(row)
            await session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=invalid_msg)

    user_result = await session.execute(select(User).where(User.id == row.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        await session.delete(row)
        await session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=invalid_msg)

    user.hashed_password = get_password_hash(body.new_password)
    await session.delete(row)
    await session.commit()
    return MessageResponse(message="Parola a fost actualizată. Te poți autentifica cu noua parolă.")


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
