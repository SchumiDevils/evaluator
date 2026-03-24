"""Fereastră temporală evaluări: lifecycle derivat din timp (fără scheduler)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from ..models.evaluation import Evaluation


def dt_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def evaluation_lifecycle(ev: Evaluation, now: datetime) -> str:
    """
    Status derivat pentru UX / acces studenți (nu înlocuiește câmpul DB `status` pentru draft).
    - draft: evaluare nepregătită / nepublicată
    - scheduled: publicată (DB active) dar acum < start_at
    - active: în fereastra [start_at, end_at) sau fără restricții de timp
    - closed: închisă manual (DB closed) sau acum >= end_at
    """
    if ev.status == "draft":
        return "draft"
    if ev.status == "closed":
        return "closed"
    start = dt_utc(ev.scheduled_starts_at)
    end = dt_utc(ev.scheduled_ends_at)
    if start is not None and now < start:
        return "scheduled"
    if end is not None and now >= end:
        return "closed"
    return "active"


def student_may_take_evaluation(ev: Evaluation, now: Optional[datetime] = None) -> bool:
    """Student poate începe / continua evaluarea (în fereastră, publicată)."""
    now = now or datetime.now(timezone.utc)
    return evaluation_lifecycle(ev, now) == "active"


def schedule_blocks_access(ev: Evaluation, now: datetime) -> Optional[str]:
    """Mesaj dacă accesul e blocat de fereastră sau închidere manuală."""
    lc = evaluation_lifecycle(ev, now)
    if lc == "scheduled":
        return "Evaluarea nu a început încă. Încearcă mai târziu."
    if lc == "closed":
        if ev.status == "closed":
            return "Evaluarea a fost închisă de profesor."
        return "Perioada de evaluare s-a încheiat."
    return None


def schedule_block_kind(ev: Evaluation, now: datetime) -> Optional[str]:
    if not student_may_take_evaluation(ev, now):
        lc = evaluation_lifecycle(ev, now)
        if lc == "scheduled":
            return "before_start"
        if lc == "closed":
            return "after_end"
    return None


def lifecycle_enrichment(ev: Evaluation, now: datetime) -> Dict[str, Any]:
    """Câmpuri pentru API: server_now, countdown-uri, start/end canonice."""
    lc = evaluation_lifecycle(ev, now)
    start = dt_utc(ev.scheduled_starts_at)
    end = dt_utc(ev.scheduled_ends_at)
    seconds_until_start: Optional[int] = None
    seconds_until_end: Optional[int] = None
    if start is not None and now < start:
        seconds_until_start = max(0, int((start - now).total_seconds()))
    if end is not None and now < end:
        seconds_until_end = max(0, int((end - now).total_seconds()))
    return {
        "lifecycle_status": lc,
        "server_now": now,
        "seconds_until_start": seconds_until_start,
        "seconds_until_end": seconds_until_end,
        "start_at": ev.scheduled_starts_at,
        "end_at": ev.scheduled_ends_at,
    }


def exam_seconds_remaining(
    started_at: datetime,
    exam_duration_minutes: int,
    now: datetime,
    window_end_at: Optional[datetime],
) -> int:
    """
    Timp rămas pentru completare: minim dintre
    (durata examenului de la started_at) și (până la end_at fereastră).
    """
    mins = max(1, int(exam_duration_minutes or 1))
    total = mins * 60
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    elapsed = (now - started_at).total_seconds()
    left = max(0, int(total - elapsed))
    end_u = dt_utc(window_end_at)
    if end_u is not None:
        until_window = (end_u - now).total_seconds()
        left = min(left, max(0, int(until_window)))
    return left


# Alias pentru cod existent
student_may_access_evaluation = student_may_take_evaluation


def should_reset_attempt_start(attempt_started_at: datetime, eval_start_at: Optional[datetime], now: datetime) -> bool:
    """
    Dacă încercarea a fost marcată înainte de start_at oficial al ferestrei,
    la primul /start în fereastră resetăm cronometrul examenului (nu „expirat” din trecut).
    """
    su = dt_utc(eval_start_at)
    if su is None:
        return False
    ast = dt_utc(attempt_started_at)
    if ast is None:
        return False
    return ast < su and now >= su
