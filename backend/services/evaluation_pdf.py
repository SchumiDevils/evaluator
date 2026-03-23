from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

from fpdf import FPDF


def _resolve_dejavu_font(filename: str) -> Path:
    """
    PyPI wheel-ul fpdf2 nu include mereu TTF-urile la calea din site-packages.
    Fonturile DejaVu sunt versionate în repo (backend/fonts/) — aceeași sursă ca testele fpdf2.
    """
    bundled = Path(__file__).resolve().parent.parent / "fonts" / filename
    if bundled.is_file():
        return bundled

    import fpdf as _fpdf_pkg

    wheel = Path(_fpdf_pkg.__file__).resolve().parent / "font" / filename
    if wheel.is_file():
        return wheel

    for extra in (
        Path("/usr/share/fonts/truetype/dejavu") / filename,
        Path("/usr/share/fonts/truetype") / filename,
    ):
        if extra.is_file():
            return extra

    raise RuntimeError(
        f"Lipsește {filename}. Plasează fișierul în backend/fonts/ (vezi sursa oficială DejaVu / fpdf2 test/fonts)."
    )


def _safe_text(s: Optional[str]) -> str:
    if s is None:
        return ""
    return str(s).replace("\r\n", "\n")


def build_evaluation_results_pdf(
    *,
    title: str,
    subject: Optional[str],
    description: Optional[str],
    professor_name: Optional[str],
    exported_at: datetime,
    grouped_students: List[dict[str, Any]],
) -> bytes:
    """Build PDF bytes for professor export. grouped_students from export endpoint."""
    reg = _resolve_dejavu_font("DejaVuSans.ttf")
    bol = _resolve_dejavu_font("DejaVuSans-Bold.ttf")

    pdf = FPDF()
    pdf.add_font("DejaVu", "", str(reg))
    pdf.add_font("DejaVu", "B", str(bol))
    pdf.set_auto_page_break(auto=True, margin=15)

    pdf.add_page()
    pdf.set_font("DejaVu", "B", 16)
    pdf.multi_cell(0, 10, _safe_text(title)[:500])
    pdf.ln(2)
    pdf.set_font("DejaVu", "", 10)
    if subject:
        pdf.cell(0, 6, f"Materie: {_safe_text(subject)}", ln=True)
    if description:
        pdf.multi_cell(0, 6, f"Descriere: {_safe_text(description)}")
    pdf.cell(
        0,
        6,
        f"Export: {exported_at.strftime('%Y-%m-%d %H:%M')} (UTC)",
        ln=True,
    )
    if professor_name:
        pdf.cell(0, 6, f"Profesor: {_safe_text(professor_name)}", ln=True)
    pdf.ln(4)

    if not grouped_students:
        pdf.set_font("DejaVu", "", 10)
        pdf.cell(0, 8, "Niciun răspuns înregistrat.", ln=True)
        out = pdf.output()
        return bytes(out) if isinstance(out, (bytes, bytearray)) else bytes(out)

    for idx, group in enumerate(grouped_students, start=1):
        name = group.get("name") or "Participant"
        responses: List[dict[str, Any]] = group.get("responses") or []
        total = group.get("total_score")
        max_pts = group.get("max_score")

        pdf.set_font("DejaVu", "B", 12)
        pdf.multi_cell(0, 8, f"{idx}. {_safe_text(name)}")
        if total is not None and max_pts is not None and max_pts > 0:
            pdf.set_font("DejaVu", "", 10)
            pdf.cell(0, 6, f"Total: {total}/{max_pts} puncte", ln=True)
        pdf.ln(2)

        for r in responses:
            ex = r.get("ex_index", "?")
            qtext = r.get("question_text") or ""
            pdf.set_font("DejaVu", "B", 10)
            pdf.multi_cell(0, 6, f"Exercițiul {ex}: {_safe_text(qtext)}")
            pdf.set_font("DejaVu", "", 10)
            pdf.cell(0, 6, "Răspuns:", ln=True)
            ans = _safe_text(r.get("answer_text")) or "—"
            pdf.set_font("DejaVu", "", 10)
            pdf.multi_cell(0, 6, ans)

            score = r.get("score")
            pts = r.get("points")
            if score is not None and pts is not None:
                pdf.cell(0, 6, f"Scor: {score}/{pts} puncte", ln=True)

            for fb in r.get("feedback") or []:
                cat = _safe_text(fb.get("category"))
                msg = _safe_text(fb.get("message"))
                src = _safe_text(fb.get("source"))
                pdf.set_font("DejaVu", "", 9)
                pdf.multi_cell(0, 5, f"  • [{cat}] ({src}): {msg}")
            pdf.ln(3)

    out = pdf.output()
    return bytes(out) if isinstance(out, (bytes, bytearray)) else bytes(out)
