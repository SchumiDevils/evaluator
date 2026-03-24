"""Reguli de acces pentru evaluări (status + fereastră programată)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from ..models.evaluation import Evaluation


def dt_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def schedule_blocks_access(ev: Evaluation, now: datetime) -> Optional[str]:
    """Mesaj dacă fereastra de programare blochează accesul; None dacă nu e blocat de dată/oră."""
    start = dt_utc(ev.scheduled_starts_at)
    end = dt_utc(ev.scheduled_ends_at)
    if start is not None and now < start:
        return "Evaluarea nu a început încă. Încearcă mai târziu."
    if end is not None and now > end:
        return "Perioada de evaluare s-a încheiat."
    return None


def student_may_access_evaluation(ev: Evaluation, now: Optional[datetime] = None) -> bool:
    if ev.status != "active":
        return False
    now = now or datetime.now(timezone.utc)
    return schedule_blocks_access(ev, now) is None


def schedule_block_kind(ev: Evaluation, now: Optional[datetime] = None) -> Optional[str]:
    """Înainte/după fereastra programată (evaluare activă). None dacă nu e blocată de programare."""
    if ev.status != "active":
        return None
    now = now or datetime.now(timezone.utc)
    if student_may_access_evaluation(ev, now):
        return None
    start = dt_utc(ev.scheduled_starts_at)
    end = dt_utc(ev.scheduled_ends_at)
    if start is not None and now < start:
        return "before_start"
    if end is not None and now > end:
        return "after_end"
    return None
