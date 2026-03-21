from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import get_settings
from .db.migrate import backfill_evaluation_access_and_enrollments, run_schema_migrations
from .db.session import async_session_maker, engine
from .models import Base  # noqa: F401 — triggers model registration
from .routers import analytics, auth, evaluations, feedback

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allow_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
