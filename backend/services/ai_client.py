from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Iterable, Optional

import httpx
from openai import AsyncOpenAI

from ..core.config import get_settings
from ..schemas.feedback import FeedbackItemSchema

settings = get_settings()


@dataclass
class AIResult:
    feedback: list[FeedbackItemSchema]
    token_usage: Optional[int] = None
    score: Optional[int] = None


def _parse_text_to_feedback(text: str, source: str) -> list[FeedbackItemSchema]:
    items: list[FeedbackItemSchema] = []

    for line in text.splitlines():
        line = line.strip("-• \t")
        if not line:
            continue
        if ":" in line:
            category, message = line.split(":", 1)
            items.append(FeedbackItemSchema(category=category.strip().title(), message=message.strip(), source=source))
        else:
            items.append(FeedbackItemSchema(category="Observație", message=line, source=source))

    if not items:
        items.append(
            FeedbackItemSchema(
                category="Observație",
                message=text.strip() or "Modelul nu a returnat feedback explicit.",
                source=source,
            )
        )
    return items


def _build_prompts(
    answer: str,
    rubric: Optional[Iterable[str]] = None,
    question_type: Optional[str] = None,
    question_text: Optional[str] = None,
    max_points: Optional[int] = None,
) -> tuple[str, str]:
    rubric_prompt = (
        "\n".join(f"- {criterion}" for criterion in rubric)
        if rubric
        else "- Calitatea răspunsului.\n- Claritate.\n- Exemple."
    )

    question_ctx = f"\nÎntrebarea: {question_text}\n" if question_text else ""

    if question_type in ("multiple_choice", "checkboxes"):
        system_prompt = (
            "Ești un profesor care oferă feedback scurt pentru un exercițiu de tip alegere. "
            "Explică de ce răspunsul ales este corect sau greșit în maximum 2 observații. "
            "Nu da exemple detaliate. Format: 'Categorie: mesaj', fiecare pe o linie. "
            "Scrie în limba română."
        )
        user_prompt = (
            f"{question_ctx}"
            f"Răspuns student: {answer}\n\n"
            "Oferă feedback scurt despre alegerea făcută."
        )
    elif question_type == "short_answer":
        system_prompt = (
            "Ești un profesor care evaluează răspunsuri scurte. "
            "Returnează STRICT JSON valid cu schema: "
            '{"score": <int>, "feedback": [{"category":"...", "message":"..."}]}. '
            "score trebuie să fie între 0 și punctajul maxim primit. "
            "feedback trebuie să aibă 2-4 observații utile. Scrie în limba română."
        )
        max_points_text = f"{max_points}" if max_points is not None else "10"
        user_prompt = (
            f"{question_ctx}"
            f"Punctaj maxim: {max_points_text}\n"
            f"Răspuns student:\n{answer}\n\n"
            "Evaluează răspunsul scurt al studentului și acordă punctaj."
        )
    else:
        system_prompt = (
            "Ești un profesor care evaluează răspunsuri descriptive. "
            "Returnează STRICT JSON valid cu schema: "
            '{"score": <int>, "feedback": [{"category":"...", "message":"..."}]}. '
            "score trebuie să fie între 0 și punctajul maxim primit. "
            "feedback trebuie să aibă 3-5 observații utile. Scrie în limba română."
        )
        max_points_text = f"{max_points}" if max_points is not None else "10"
        user_prompt = (
            f"{question_ctx}"
            f"Punctaj maxim: {max_points_text}\n"
            f"Răspuns student:\n{answer}\n\n"
            "Evaluează folosind această rubrică:\n"
            f"{rubric_prompt}\n\n"
            "Acordă punctaj și feedback conform rubricii."
        )

    return system_prompt, user_prompt


async def _generate_with_openai_compatible(
    api_key: str,
    model: str,
    answer: str,
    source: str,
    rubric: Optional[Iterable[str]] = None,
    base_url: Optional[str] = None,
    question_type: Optional[str] = None,
    question_text: Optional[str] = None,
    max_points: Optional[int] = None,
) -> AIResult:
    system_prompt, user_prompt = _build_prompts(answer, rubric, question_type, question_text, max_points)

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    response = await client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
    )

    text_output = response.choices[0].message.content or ""
    total_tokens = response.usage.total_tokens if response.usage else None

    parsed_score: Optional[int] = None
    parsed_feedback: list[FeedbackItemSchema] = []

    try:
        parsed = json.loads(text_output)
        if isinstance(parsed, dict):
            raw_score = parsed.get("score")
            if isinstance(raw_score, (int, float)):
                parsed_score = int(round(raw_score))
                if max_points is not None:
                    parsed_score = max(0, min(parsed_score, max_points))
                else:
                    parsed_score = max(0, parsed_score)

            raw_feedback = parsed.get("feedback", [])
            if isinstance(raw_feedback, list):
                for item in raw_feedback:
                    if isinstance(item, dict):
                        category = str(item.get("category", "Observație")).strip() or "Observație"
                        message = str(item.get("message", "")).strip()
                        if message:
                            parsed_feedback.append(
                                FeedbackItemSchema(category=category, message=message, source=source)
                            )
    except (json.JSONDecodeError, TypeError, ValueError):
        parsed_feedback = []

    if not parsed_feedback:
        parsed_feedback = _parse_text_to_feedback(text_output, source=source)

    return AIResult(feedback=parsed_feedback, token_usage=total_tokens, score=parsed_score)


async def _generate_with_groq(
    answer: str,
    rubric: Optional[Iterable[str]] = None,
    question_type: Optional[str] = None,
    question_text: Optional[str] = None,
    max_points: Optional[int] = None,
) -> AIResult:
    if not settings.groq_api_key:
        raise RuntimeError("Groq API key is not configured")

    return await _generate_with_openai_compatible(
        api_key=settings.groq_api_key,
        model=settings.groq_model,
        answer=answer,
        source="ai:groq",
        rubric=rubric,
        base_url="https://api.groq.com/openai/v1",
        question_type=question_type,
        question_text=question_text,
        max_points=max_points,
    )


async def _generate_with_openai(
    answer: str,
    rubric: Optional[Iterable[str]] = None,
    question_type: Optional[str] = None,
    question_text: Optional[str] = None,
    max_points: Optional[int] = None,
) -> AIResult:
    if not settings.openai_api_key:
        raise RuntimeError("OpenAI API key is not configured")

    return await _generate_with_openai_compatible(
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        answer=answer,
        source="ai:openai",
        rubric=rubric,
        question_type=question_type,
        question_text=question_text,
        max_points=max_points,
    )


async def _generate_with_huggingface(
    answer: str,
    rubric: Optional[Iterable[str]] = None,
    question_type: Optional[str] = None,
    question_text: Optional[str] = None,
    max_points: Optional[int] = None,
) -> AIResult:
    if not settings.huggingface_api_token or not settings.huggingface_model:
        raise RuntimeError("Hugging Face configuration missing")

    url = f"https://api-inference.huggingface.co/models/{settings.huggingface_model}"
    system_prompt, user_prompt = _build_prompts(answer, rubric, question_type, question_text, max_points)
    prompt = f"{system_prompt}\n\n{user_prompt}"

    headers = {
        "Authorization": f"Bearer {settings.huggingface_api_token}",
        "Accept": "application/json",
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, headers=headers, json={"inputs": prompt})
        response.raise_for_status()
        data = response.json()

    if isinstance(data, list) and data and isinstance(data[0], dict) and "generated_text" in data[0]:
        text = data[0]["generated_text"]
    elif isinstance(data, dict) and "generated_text" in data:
        text = data["generated_text"]
    else:
        text = str(data)

    parsed_score: Optional[int] = None
    parsed_feedback: list[FeedbackItemSchema] = []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            raw_score = parsed.get("score")
            if isinstance(raw_score, (int, float)):
                parsed_score = int(round(raw_score))
                if max_points is not None:
                    parsed_score = max(0, min(parsed_score, max_points))
                else:
                    parsed_score = max(0, parsed_score)
            raw_feedback = parsed.get("feedback", [])
            if isinstance(raw_feedback, list):
                for item in raw_feedback:
                    if isinstance(item, dict):
                        category = str(item.get("category", "Observație")).strip() or "Observație"
                        message = str(item.get("message", "")).strip()
                        if message:
                            parsed_feedback.append(
                                FeedbackItemSchema(category=category, message=message, source="ai:huggingface")
                            )
    except (json.JSONDecodeError, TypeError, ValueError):
        parsed_feedback = []

    if not parsed_feedback:
        parsed_feedback = _parse_text_to_feedback(text, source="ai:huggingface")

    return AIResult(feedback=parsed_feedback, score=parsed_score)


async def generate_ai_feedback(
    answer: str,
    rubric: Optional[Iterable[str]] = None,
    question_type: Optional[str] = None,
    question_text: Optional[str] = None,
    max_points: Optional[int] = None,
) -> AIResult:
    kwargs = dict(
        answer=answer,
        rubric=rubric,
        question_type=question_type,
        question_text=question_text,
        max_points=max_points,
    )
    if settings.groq_api_key:
        return await _generate_with_groq(**kwargs)
    if settings.openai_api_key:
        return await _generate_with_openai(**kwargs)
    if settings.huggingface_api_token and settings.huggingface_model:
        return await _generate_with_huggingface(**kwargs)
    raise RuntimeError("No AI provider configured. Set Groq, OpenAI, or Hugging Face credentials.")
