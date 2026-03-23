from __future__ import annotations

import re

from .config import get_settings

# Vercel production + preview: *.vercel.app (subdomeniul poate conține și puncte, ex. xxx-git-main-yyy)
_DEFAULT_VERCEL_REGEX = r"^https://[a-zA-Z0-9.\-]+\.vercel\.app$"


def effective_origin_regex() -> str:
    settings = get_settings()
    raw = (settings.allow_origin_regex or "").strip()
    return raw or _DEFAULT_VERCEL_REGEX


def origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False
    settings = get_settings()
    if origin in settings.allow_origins:
        return True
    return bool(re.match(effective_origin_regex(), origin))
