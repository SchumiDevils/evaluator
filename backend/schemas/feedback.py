from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class FeedbackItemSchema(BaseModel):
    category: str = Field(..., max_length=64)
    message: str
    source: str = "rule_based"

    class Config:
        from_attributes = True


class ResponseCreate(BaseModel):
    answer: str
    evaluation_id: int | None = None
    mode: str = Field(default="rule_based", pattern="^(rule_based|ai)$")
    rubric: list[str] | None = None


class ResponseRead(BaseModel):
    id: int
    answer: str
    evaluation_id: int | None
    created_at: datetime
    feedback: list[FeedbackItemSchema]

    class Config:
        from_attributes = True


class FeedbackResponse(BaseModel):
    response_id: int
    feedback: list[FeedbackItemSchema]


