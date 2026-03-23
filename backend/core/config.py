from __future__ import annotations

import secrets
from functools import lru_cache
from typing import Literal, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Rubrix API"
    api_v1_prefix: str = "/api/v1"

    database_url: str = Field(
        default="sqlite+aiosqlite:///./app.db",
        description="SQLAlchemy compatible URL. Use async driver.",
    )

    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    access_token_expire_minutes: int = 60
    jwt_algorithm: str = "HS256"

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"

    groq_api_key: Optional[str] = None
    groq_model: str = "llama-3.3-70b-versatile"

    huggingface_api_token: Optional[str] = None
    huggingface_model: Optional[str] = None
    huggingface_task: Literal["text-classification", "text-generation"] = "text-generation"

    # Explicit origins (JSON array in env: ALLOW_ORIGINS='["http://localhost:5173"]')
    allow_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )
    # *.vercel.app — subdomeniul poate conține puncte (ex. preview deploy)
    allow_origin_regex: Optional[str] = Field(
        default=r"^https://[a-zA-Z0-9.\-]+\.vercel\.app$",
        description="Regex for extra allowed origins (Vercel frontends).",
    )

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


