from __future__ import annotations

import json
import logging
from typing import Optional

from openai import AsyncOpenAI

from ..core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

SYSTEM_PROMPT = """\
Ești un profesor expert care analizează documente PDF cu teste/evaluări și le convertește în format JSON structurat.

Analizează textul extras dintr-un PDF de evaluare și returnează STRICT un JSON valid cu următoarea structură:
{
  "title": "Titlul evaluării (sau generat din context)",
  "subject": "Disciplina/materia (sau null)",
  "questions": [
    {
      "question_type": "long_answer" | "short_answer" | "multiple_choice" | "checkboxes",
      "text": "Textul complet al întrebării",
      "options": ["Opțiune 1", "Opțiune 2", ...] sau null pentru întrebări deschise,
      "correct_answer": "Răspunsul corect, dacă apare în document" sau null,
      "points": punctaj (integer, default 10)
    }
  ]
}

Reguli:
- Identifică TOATE întrebările din text.
- Alege question_type corect: "multiple_choice" dacă are variante de răspuns cu un singur răspuns corect, "checkboxes" dacă permite mai multe răspunsuri, "short_answer" pentru răspunsuri scurte (1-2 propoziții), "long_answer" pentru întrebări descriptive/eseu.
- options trebuie să fie un array de string-uri DOAR pentru multiple_choice și checkboxes, altfel null.
- Dacă punctajul e menționat în document, folosește-l. Altfel, pune 10.
- Dacă titlul evaluării nu apare explicit, generează unul scurt pe baza conținutului.
- Returnează DOAR JSON-ul, fără explicații sau markdown."""


def _strip_code_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        first_newline = stripped.find("\n")
        if first_newline != -1:
            stripped = stripped[first_newline + 1:]
        if stripped.endswith("```"):
            stripped = stripped[:-3]
    return stripped.strip()


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    import fitz  # PyMuPDF

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n".join(pages)


async def parse_pdf_with_ai(pdf_text: str) -> dict:
    if settings.groq_api_key:
        api_key = settings.groq_api_key
        model = settings.groq_model
        base_url = "https://api.groq.com/openai/v1"
    elif settings.openai_api_key:
        api_key = settings.openai_api_key
        model = settings.openai_model
        base_url = None
    else:
        raise RuntimeError("Nu este configurat niciun provider AI (Groq/OpenAI).")

    truncated = pdf_text[:12000]

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Iată textul extras dintr-un PDF de evaluare:\n\n{truncated}"},
        ],
        temperature=0.1,
    )

    text_output = response.choices[0].message.content or ""
    cleaned = _strip_code_fences(text_output)

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.error("AI returned invalid JSON for PDF import: %s", text_output[:500])
        raise ValueError("AI-ul nu a returnat un JSON valid. Încearcă din nou.")

    if not isinstance(result, dict) or "questions" not in result:
        raise ValueError("Structura returnată de AI este invalidă.")

    return result
