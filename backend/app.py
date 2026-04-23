from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import get_settings
from .core.cors import effective_origin_regex
from .core.http_middleware import CORSHeadersFixMiddleware
from .db.migrate import backfill_evaluation_access_and_enrollments, run_schema_migrations
from .db.session import async_session_maker, engine
from .models import Base  # noqa: F401 — triggers model registration
from .routers import analytics, auth, chat, evaluations, feedback

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.2.0")

_origin_regex = effective_origin_regex()

_cors = dict(
    allow_origins=settings.allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=_origin_regex,
)

app.add_middleware(CORSMiddleware, **_cors)
# După CORSMiddleware: completează header-e CORS pe răspunsuri unde lipseau (ex. 500).
app.add_middleware(CORSHeadersFixMiddleware)


@app.on_event("startup")
async def on_startup() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await run_schema_migrations(conn)
    async with async_session_maker() as session:
        await backfill_evaluation_access_and_enrollments(session)
        await session.commit()


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(evaluations.router, prefix=settings.api_v1_prefix)
app.include_router(feedback.router, prefix=settings.api_v1_prefix)
app.include_router(analytics.router, prefix=settings.api_v1_prefix)
app.include_router(chat.router, prefix=settings.api_v1_prefix)
