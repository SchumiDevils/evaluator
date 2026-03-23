from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .cors import origin_allowed


class CORSHeadersFixMiddleware(BaseHTTPMiddleware):
    """
    CORSMiddleware nu aplică mereu header-e pe răspunsuri de eroare / excepții.
    Completează Access-Control-Allow-Origin când lipsește, pentru aceleași reguli ca în config.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        origin = request.headers.get("origin")
        if not origin:
            return response
        if response.headers.get("access-control-allow-origin"):
            return response
        if origin_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
