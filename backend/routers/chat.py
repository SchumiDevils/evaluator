from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from openai import AsyncOpenAI
from pydantic import BaseModel

from ..core.config import get_settings
from ..models import User
from ..models.user import UserRole
from .auth import get_current_user

router = APIRouter(prefix="/chat", tags=["chat"])

settings = get_settings()

SYSTEM_PROMPT = (
    "Ești un asistent AI dedicat profesorilor. "
    "Ajuți cu: crearea de întrebări de evaluare și teste, rubrici de notare, "
    "planificarea lecțiilor, strategii pedagogice, explicarea conceptelor dificile, "
    "redactarea de materiale didactice și orice altceva legat de activitatea didactică. "
    "Răspunde mereu în limba română, concis, practic și structurat. "
    "Când generezi întrebări sau rubrici, folosește formate clare, numerotate sau cu bullet points."
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str


@router.post("/message", response_model=ChatResponse)
async def send_message(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    if current_user.role != UserRole.PROFESSOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Această funcționalitate este disponibilă doar pentru profesori.",
        )

    if not settings.groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviciul AI nu este configurat. Contactați administratorul.",
        )

    if not body.messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Lista de mesaje nu poate fi goală.",
        )

    client = AsyncOpenAI(
        api_key=settings.groq_api_key,
        base_url="https://api.groq.com/openai/v1",
    )

    api_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in body.messages:
        if msg.role in ("user", "assistant"):
            api_messages.append({"role": msg.role, "content": msg.content})

    response = await client.chat.completions.create(
        model=settings.groq_model,
        messages=api_messages,
        max_tokens=2048,
    )

    reply = response.choices[0].message.content or ""
    return ChatResponse(reply=reply)
