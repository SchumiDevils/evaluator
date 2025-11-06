from __future__ import annotations

from dataclasses import dataclass


EXAMPLE_KEYWORDS = ["exemplu", "de exemplu", "spre exemplu"]
POSITIVE_TONE_KEYWORDS = ["bun", "interesant", "util", "important", "clar"]
NEGATIVE_TONE_KEYWORDS = ["dificil", "confuz", "slab", "greu", "nu"]  # intentionally broad


@dataclass
class FeedbackItem:
    category: str
    message: str
    source: str = "rule_based"

    def to_schema(self) -> "FeedbackItemSchema":
        from .schemas.feedback import FeedbackItemSchema  # local import to avoid circular

        return FeedbackItemSchema(category=self.category, message=self.message, source=self.source)


def analyze_length(answer: str) -> FeedbackItem:
    length = len(answer)
    if length < 40:
        return FeedbackItem(
            category="Lungime",
            message="Răspunsul este foarte scurt; adaugă câteva detalii suplimentare.",
        )
    if length < 120:
        return FeedbackItem(category="Lungime", message="Răspunsul are o lungime potrivită.")
    if length < 280:
        return FeedbackItem(
            category="Lungime",
            message="Răspunsul este detaliat; încearcă să structurezi ideile pentru claritate.",
        )
    return FeedbackItem(
        category="Lungime",
        message="Răspunsul este foarte amplu; concentrează-te pe ideile principale pentru concizie.",
    )


def analyze_structure(answer: str) -> FeedbackItem:
    sentences = [sentence for sentence in answer.replace("\n", " ").split(".") if sentence.strip()]
    if len(sentences) <= 1:
        return FeedbackItem(
            category="Structură",
            message="Încearcă să împarți răspunsul în propoziții sau paragrafe distincte.",
        )
    has_bullets = any(
        indicator in answer for indicator in ["1.", "2.", "- ", "•", "•", "◦", "→"]
    )
    if has_bullets:
        return FeedbackItem(
            category="Structură",
            message="Îți organizezi ideile în pași/clasificări – continuă în această direcție.",
        )
    return FeedbackItem(
        category="Structură",
        message="Structura este OK; pentru un plus, poți evidenția ideile cheie cu marcatori.",
    )


def analyze_examples(answer: str) -> FeedbackItem:
    lower = answer.lower()
    has_example = any(keyword in lower for keyword in EXAMPLE_KEYWORDS)
    if has_example:
        return FeedbackItem(
            category="Exemple",
            message="Ai inclus un exemplu concret – acest lucru ajută la clarificarea ideilor.",
        )
    return FeedbackItem(
        category="Exemple",
        message="Adaugă un exemplu concret sau un caz pentru a-ți susține argumentele.",
    )


def analyze_tone(answer: str) -> FeedbackItem:
    lower = answer.lower()
    positive_hits = sum(keyword in lower for keyword in POSITIVE_TONE_KEYWORDS)
    negative_hits = sum(keyword in lower for keyword in NEGATIVE_TONE_KEYWORDS)

    if positive_hits > negative_hits:
        message = "Tonul general este pozitiv și încurajator."
    elif negative_hits > positive_hits:
        message = "Tonul general pare critic; asigură-te că echilibrezi observațiile cu argumente."
    else:
        message = "Tonul pare neutru; poți evidenția clar ce apreciezi și ce ai îmbunătăți."

    return FeedbackItem(category="Ton", message=message)


def generate_feedback(answer: str) -> list[FeedbackItem]:
    trimmed = answer.strip()
    if not trimmed:
        return [FeedbackItem(category="General", message="Completează un răspuns pentru a primi feedback.")]

    return [
        analyze_length(trimmed),
        analyze_structure(trimmed),
        analyze_examples(trimmed),
        analyze_tone(trimmed),
    ]


