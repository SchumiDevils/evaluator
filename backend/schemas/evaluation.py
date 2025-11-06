from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class EvaluationBase(BaseModel):
    title: str
    description: str | None = None


class EvaluationCreate(EvaluationBase):
    pass


class EvaluationRead(EvaluationBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


