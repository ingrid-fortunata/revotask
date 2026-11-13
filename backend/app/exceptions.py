"""Typed API exceptions that the central handlers convert to the JSON error envelope (BE05)."""

from __future__ import annotations


class ApiError(Exception):
    """An expected failure with a stable HTTP status and error code."""

    status: int = 500
    code: str = "INTERNAL_ERROR"
    message: str = "Something went wrong."

    def __init__(self, message: str | None = None, *, fields: dict[str, str] | None = None):
        super().__init__(self.code)
        if message is not None:
            self.message = message
        self.fields = fields


class ServiceUnavailableError(ApiError):
    """A required dependency, such as the database, cannot answer (503)."""

    status = 503
    code = "SERVICE_UNAVAILABLE"
    message = "The service is temporarily unavailable. Try again shortly."
