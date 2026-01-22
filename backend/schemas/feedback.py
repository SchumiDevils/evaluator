from __future__ import annotations

from datetime import datetime

from typing import List, Optional

from pydantic import BaseModel, Field


class FeedbackItemSchema(BaseModel):
    category: str = Field(..., max_length=64)
    message: str
    source: str = "rule_based"

    class Config:
        from_attributes = True


class ResponseCreate(BaseModel):
    answer: str
    evaluation_id: Optional[int] = None
    mode: str = Field(default="rule_based", pattern="^(rule_based|ai)$")
    rubric: Optional[List[str]] = None


class ResponseRead(BaseModel):
    id: int
    answer: str
    evaluation_id: Optional[int]
    created_at: datetime
    feedback: List[FeedbackItemSchema]

    class Config:
        from_attributes = True


class FeedbackResponse(BaseModel):
    response_id: int
    feedback: List[FeedbackItemSchema]


