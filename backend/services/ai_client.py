from __future__ import annotations

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


async def _generate_with_openai(answer: str, rubric: Optional[Iterable[str]] = None) -> AIResult:
    if not settings.openai_api_key:
        raise RuntimeError("OpenAI API key is not configured")

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    rubric_prompt = (
        "\n".join(f"- {criterion}" for criterion in rubric) if rubric else "- Calitatea răspunsului.\n- Claritate.\n- Exemple."
    )

    system_prompt = (
        "Ești un profesor care oferă feedback structurat și concis pentru răspunsurile studenților. "
        "Oferă maximum 4 observații, fiecare sub forma 'Categorie: mesaj'. "
        "Scrie în limba română."
    )

    user_prompt = (
        "Răspuns student:\n"
        f"{answer}\n\n"
        "Evaluează folosind această rubrică:\n"
        f"{rubric_prompt}\n\n"
        "Returnează lista de observații, câte una pe linie."
    )

    response = await client.responses.create(
        model=settings.openai_model,
        input=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
    )

    text_output = response.output_text
    usage = getattr(response, "usage", None)
    total_tokens = getattr(usage, "total_tokens", None) if usage else None

    return AIResult(feedback=_parse_text_to_feedback(text_output, source="ai:openai"), token_usage=total_tokens)


async def _generate_with_huggingface(answer: str, rubric: Optional[Iterable[str]] = None) -> AIResult:
    if not settings.huggingface_api_token or not settings.huggingface_model:
        raise RuntimeError("Hugging Face configuration missing")

    url = f"https://api-inference.huggingface.co/models/{settings.huggingface_model}"
    rubric_text = (
        "\n".join(f"- {criterion}" for criterion in rubric) if rubric else "- Calitatea răspunsului.\n- Claritate.\n- Exemple."
    )
    prompt = (
        "Ești un profesor care oferă feedback structurat și concis pentru răspunsurile studenților. "
        "Returnează maximum 4 linii cu formatul 'Categorie: mesaj'. Scrie în română.\n\n"
        f"Răspuns student:\n{answer}\n\nRubrică:\n{rubric_text}"
    )

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

    return AIResult(feedback=_parse_text_to_feedback(text, source="ai:huggingface"))


async def generate_ai_feedback(answer: str, rubric: Optional[Iterable[str]] = None) -> AIResult:
    if settings.openai_api_key:
        return await _generate_with_openai(answer, rubric=rubric)
    if settings.huggingface_api_token and settings.huggingface_model:
        return await _generate_with_huggingface(answer, rubric=rubric)
    raise RuntimeError("No AI provider configured. Set OpenAI or Hugging Face credentials.")


