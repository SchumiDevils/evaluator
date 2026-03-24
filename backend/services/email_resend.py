from __future__ import annotations

import html
import logging

import resend

from ..core.config import Settings

logger = logging.getLogger(__name__)


def send_password_reset_email(to_addr: str, reset_url: str, settings: Settings) -> None:
    """Trimite email de resetare prin Resend (HTTP). Fără RESEND_API_KEY, loghează linkul (dev)."""
    key = (settings.resend_api_key or "").strip()
    if not key:
        logger.warning(
            "RESEND_API_KEY neconfigurat — link resetare parolă pentru %s: %s",
            to_addr,
            reset_url,
        )
        return

    resend.api_key = key
    minutes = settings.password_reset_token_expire_minutes
    minutes_label = "1 minut" if minutes == 1 else f"{minutes} minute"
    from_addr = (settings.email_from or "Rubrix <onboarding@resend.dev>").strip()
    safe_href = html.escape(reset_url, quote=True)
    base = settings.frontend_base_url.rstrip("/")
    logo_url = f"{base}/rubrix-logo.svg"
    safe_logo_src = html.escape(logo_url, quote=True)

    html_body = f"""<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:#f6f4fb;">
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px 16px 40px; color: #111;">
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="{safe_logo_src}" alt="Rubrix" width="120" style="display: inline-block;" />
    </div>
    <h2 style="text-align: center; margin: 0 0 16px; font-size: 22px;">Resetare parolă</h2>
    <p style="margin: 0 0 16px; line-height: 1.5;">
      Ai cerut resetarea parolei pentru contul tău Rubrix.
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{safe_href}"
         style="background:#6C3BFF; color:#ffffff; padding:12px 20px; text-decoration:none; border-radius:6px; display:inline-block; font-weight: 600;">
        Resetează parola
      </a>
    </div>
    <p style="font-size: 12px; color: #888; line-height: 1.45; margin: 0;">
      Linkul expiră în {minutes_label}. Dacă nu ai cerut asta, ignoră acest email.
    </p>
  </div>
</body>
</html>"""

    text_body = (
        "Rubrix — Resetare parolă\n\n"
        f"Deschide în browser:\n{reset_url}\n\n"
        f"Linkul expiră în {minutes_label}.\n"
    )

    resend.Emails.send(
        {
            "from": from_addr,
            "to": [to_addr],
            "subject": "Resetare parolă — Rubrix",
            "html": html_body,
            "text": text_body,
        }
    )
