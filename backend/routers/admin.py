from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from ..models import Evaluation, Response, User
from ..models.user import UserRole
from .auth import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acces interzis.")
    return current_user


class AdminUserRead(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    role: str
    created_at: str

    class Config:
        from_attributes = True


class RoleUpdateBody(BaseModel):
    role: str


class AdminEvaluationRead(BaseModel):
    id: int
    title: str
    subject: Optional[str]
    status: str
    author_id: Optional[int]
    author_name: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class AdminStats(BaseModel):
    total_users: int
    total_professors: int
    total_students: int
    total_evaluations: int
    total_responses: int


@router.get("/users", response_model=List[AdminUserRead])
async def list_users(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> List[AdminUserRead]:
    result = await session.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        AdminUserRead(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
            created_at=u.created_at.isoformat(),
        )
        for u in users
    ]


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    body: RoleUpdateBody,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nu îți poți schimba propriul rol.")
    try:
        new_role = UserRole(body.role)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rol invalid.")
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizator negăsit.")
    user.role = new_role
    await session.commit()
    return {"updated": True, "role": new_role.value}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nu te poți șterge pe tine.")
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizator negăsit.")
    await session.delete(user)
    await session.commit()
    return {"deleted": True}


@router.get("/evaluations", response_model=List[AdminEvaluationRead])
async def list_all_evaluations(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> List[AdminEvaluationRead]:
    result = await session.execute(select(Evaluation).order_by(Evaluation.created_at.desc()))
    evals = result.scalars().all()

    author_ids = {e.author_id for e in evals if e.author_id}
    author_names: dict[int, str] = {}
    if author_ids:
        names_result = await session.execute(
            select(User.id, User.full_name).where(User.id.in_(author_ids))
        )
        author_names = {uid: name or f"User #{uid}" for uid, name in names_result.all()}

    return [
        AdminEvaluationRead(
            id=e.id,
            title=e.title,
            subject=e.subject,
            status=e.status,
            author_id=e.author_id,
            author_name=author_names.get(e.author_id) if e.author_id else None,
            created_at=e.created_at.isoformat(),
        )
        for e in evals
    ]


@router.delete("/evaluations/{evaluation_id}")
async def delete_evaluation(
    evaluation_id: int,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    result = await session.execute(select(Evaluation).where(Evaluation.id == evaluation_id))
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluare negăsită.")
    await session.delete(evaluation)
    await session.commit()
    return {"deleted": True}


@router.get("/stats", response_model=AdminStats)
async def get_stats(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> AdminStats:
    total_users = (await session.execute(select(func.count(User.id)))).scalar() or 0
    total_professors = (await session.execute(
        select(func.count(User.id)).where(User.role == UserRole.PROFESSOR)
    )).scalar() or 0
    total_students = (await session.execute(
        select(func.count(User.id)).where(User.role == UserRole.STUDENT)
    )).scalar() or 0
    total_evaluations = (await session.execute(select(func.count(Evaluation.id)))).scalar() or 0
    total_responses = (await session.execute(select(func.count(Response.id)))).scalar() or 0

    return AdminStats(
        total_users=total_users,
        total_professors=total_professors,
        total_students=total_students,
        total_evaluations=total_evaluations,
        total_responses=total_responses,
    )
