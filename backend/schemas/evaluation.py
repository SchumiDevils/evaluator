from __future__ import annotations

from datetime import datetime

from typing import Optional

from pydantic import BaseModel


class EvaluationBase(BaseModel):
    title: str
    description: Optional[str] = None


class EvaluationCreate(EvaluationBase):
    pass


class EvaluationRead(EvaluationBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


