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
    question_id: Optional[int] = None
    mode: str = Field(default="rule_based", pattern="^(rule_based|ai|auto)$")
    rubric: Optional[List[str]] = None


class ResponseRead(BaseModel):
    id: int
    answer_text: str
    evaluation_id: Optional[int]
    question_id: Optional[int]
    score: Optional[int]
    mode: str
    user_id: Optional[int]
    user_name: Optional[str] = None
    created_at: datetime
    feedback: List[FeedbackItemSchema]

    class Config:
        from_attributes = True


class FeedbackResponse(BaseModel):
    response_id: int
    score: Optional[int] = None
    is_correct: Optional[bool] = None
    feedback: List[FeedbackItemSchema]


class ProfessorFeedbackUpdate(BaseModel):
    score: Optional[int] = None
    feedback_message: Optional[str] = None


