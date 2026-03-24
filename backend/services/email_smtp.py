from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from ..core.config import Settings

logger = logging.getLogger(__name__)


def send_password_reset_email(to_addr: str, reset_url: str, settings: Settings) -> None:
    """Trimite email cu link de resetare. Fără SMTP configurat, loghează linkul (dev)."""
    if not (settings.smtp_host or "").strip():
        logger.warning(
            "SMTP neconfigurat — link resetare parolă pentru %s: %s",
            to_addr,
            reset_url,
        )
        return

    from_addr = (settings.smtp_from or settings.smtp_user or "").strip()
    if not from_addr:
        logger.error("smtp_from sau smtp_user lipsă; nu se poate trimite email.")
        return

    minutes = settings.password_reset_token_expire_minutes
    msg = EmailMessage()
    msg["Subject"] = "Resetare parolă — Rubrix"
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(
        f"Bună,\n\n"
        f"Ai solicitat resetarea parolei pentru contul Rubrix. Deschide linkul de mai jos "
        f"(este valabil aproximativ {minutes} minute):\n\n"
        f"{reset_url}\n\n"
        f"Dacă nu tu ai făcut această solicitare, poți ignora acest mesaj.\n"
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        user = (settings.smtp_user or "").strip()
        password = settings.smtp_password or ""
        if user and password:
            smtp.login(user, password)
        smtp.send_message(msg)
