"""Typed API exceptions that the central handlers convert to the JSON error envelope (BE05)."""

from __future__ import annotations


class ApiError(Exception):
    """An expected failure with a stable HTTP status and error code."""

    status: int = 500
    code: str = "INTERNAL_ERROR"
    message: str = "Something went wrong."
    headers: dict[str, str] | None = None

    def __init__(
        self,
        message: str | None = None,
        *,
        fields: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(self.code)
        if message is not None:
            self.message = message
        self.fields = fields
        if headers is not None:
            self.headers = headers


class ServiceUnavailableError(ApiError):
    """A required dependency, such as the database, cannot answer (503)."""

    status = 503
    code = "SERVICE_UNAVAILABLE"
    message = "The service is temporarily unavailable. Try again shortly."


class RequestValidationError(ApiError):
    """Malformed JSON, a non-object body, or invalid fields (400)."""

    status = 400
    code = "VALIDATION_ERROR"
    message = "Check the submitted fields."


class InvalidCredentialsError(ApiError):
    """Login failed. The message never says whether the email or the password was wrong (401)."""

    status = 401
    code = "INVALID_CREDENTIALS"
    message = "Invalid email or password."


class AuthRequiredError(ApiError):
    """No usable session: absent, malformed, expired, revoked or unknown subject (401)."""

    status = 401
    code = "AUTH_REQUIRED"
    message = "Authentication is required."


class EmailAlreadyExistsError(ApiError):
    status = 409
    code = "EMAIL_ALREADY_EXISTS"
    message = "An account with this email already exists."


class ContentTooLargeError(ApiError):
    status = 413
    code = "CONTENT_TOO_LARGE"
    message = "The request body is too large."


class UnsupportedMediaTypeError(ApiError):
    status = 415
    code = "UNSUPPORTED_MEDIA_TYPE"
    message = "The request must use Content-Type application/json."


class RateLimitedError(ApiError):
    status = 429
    code = "RATE_LIMITED"
    message = "Too many requests. Try again later."


class NotFoundError(ApiError):
    """A board or nested resource is missing, deleted, or not visible to the caller (404).

    Missing boards, deleted boards, nonmembers and removed members all raise this class, so the
    response cannot reveal which board IDs exist (DD1).
    """

    status = 404
    code = "NOT_FOUND"
    message = "Resource not found."


class UserNotFoundError(ApiError):
    """E11 email matches no registered user. Raised only after the admin check passes (404)."""

    status = 404
    code = "USER_NOT_FOUND"
    message = "No registered user has this email."


class UnauthorizedBoardAccessError(ApiError):
    """A current participant lacks the role for the action (403)."""

    status = 403
    code = "FORBIDDEN"
    message = "You do not have permission for this action."


class StateConflictError(ApiError):
    """The request conflicts with current state, such as a duplicate active member (409)."""

    status = 409
    code = "STATE_CONFLICT"
    message = "The request conflicts with the current state."
