"""JSON request parsing and schema validation shared by every feature (BE03).

`request.get_json()` raises 415 for a wrong Content-Type, 413 above `MAX_CONTENT_LENGTH` and
400 for malformed JSON. The central handlers in `app.errors` turn those into the JSON envelope.
Field messages are fixed strings defined by each schema, so no message echoes an input value.

The generic string and email validators also live here (DD14), so the auth and boards schemas
apply the same rules. Feature-specific rules (name length, password composition) stay in their
own blueprint.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from flask import request
from marshmallow import Schema, ValidationError, fields
from marshmallow import ValidationError as MarshmallowValidationError

from app.exceptions import RequestValidationError

BODY_MESSAGE = "The request body must be a JSON object."

EMAIL_MAX = 254
REQUIRED = "Required."
NOT_TEXT = "Must be text."
UNKNOWN = "Unknown field."
EMAIL_LENGTH = f"Must be at most {EMAIL_MAX} characters."
EMAIL_FORMAT = "Enter a valid email address."
# Error messages for a required, null or non-text value. Shared by the auth and profile schemas.
FIELD_MESSAGES = {"required": REQUIRED, "null": REQUIRED, "invalid": NOT_TEXT}
REPEATED = "Send one value."

# One simple rule, written the same way in frontend/lib/authRules.ts.
EMAIL_PATTERN = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")


def normalize_email(value: str) -> str:
    """The only place that trims and lowercases an email (A2, A13)."""
    return value.strip().lower()


class TrimmedString(fields.String):
    def _deserialize(self, value: Any, attr: str | None, data: Any, **kwargs: Any) -> str:
        return super()._deserialize(value, attr, data, **kwargs).strip()


class NormalizedString(fields.String):
    """A string that is trimmed and lowercased like an email, without the format check."""

    def _deserialize(self, value: Any, attr: str | None, data: Any, **kwargs: Any) -> str:
        return normalize_email(super()._deserialize(value, attr, data, **kwargs))


class UtcDateTime(fields.Field):
    """An aware datetime as ISO 8601 UTC, whatever zone the connection returned (comments DD7)."""

    def _serialize(self, value: datetime | None, attr: str | None, obj: Any, **kwargs: Any):
        if value is None:
            return None
        return value.astimezone(UTC).isoformat()


def not_blank(value: str) -> None:
    if not value:
        raise ValidationError(REQUIRED)


def email_format(value: str) -> None:
    if not EMAIL_PATTERN.fullmatch(value):
        raise ValidationError(EMAIL_FORMAT)


def first_messages(messages: Mapping[str, Any]) -> dict[str, str]:
    """Keep one fixed message per field. Non-field entries such as `_schema` are dropped."""
    field_messages: dict[str, str] = {}
    for name, value in messages.items():
        if name.startswith("_"):
            continue
        message = value[0] if isinstance(value, list) and value else value
        if isinstance(message, str):
            field_messages[name] = message
    return field_messages


def load_json_body(schema: Schema) -> dict[str, Any]:
    """Parse the JSON object in the request and validate it with `schema`."""
    payload = request.get_json()
    if not isinstance(payload, dict):
        raise RequestValidationError(BODY_MESSAGE)
    try:
        return schema.load(payload)
    except MarshmallowValidationError as exc:
        field_messages = first_messages(exc.messages)
        if not field_messages:
            raise RequestValidationError(BODY_MESSAGE) from None
        raise RequestValidationError(fields=field_messages) from None


def load_query_args(schema: Schema) -> dict[str, Any]:
    """Validate the URL query string with `schema` (S3).

    Each known parameter must be sent once. A repeated known key gets "Send one value." on its
    field. An unknown key is an error with the standard message and no field entry for it. The
    messages never echo input. No database access happens here.
    """
    raw = request.args.to_dict(flat=False)
    known = {key: values for key, values in raw.items() if key in schema.fields}
    errors = {key: REPEATED for key, values in known.items() if len(values) > 1}
    try:
        loaded = schema.load({key: values[0] for key, values in known.items() if len(values) == 1})
    except MarshmallowValidationError as exc:
        loaded = {}
        for key, message in first_messages(exc.messages).items():
            errors.setdefault(key, message)
    if errors or len(known) != len(raw):
        raise RequestValidationError(fields=errors or None)
    return loaded


class StrictBool(fields.Field):
    """A JSON boolean only. `1`, `"true"` and `null` are rejected."""

    def __init__(self, message: str, **kwargs: Any) -> None:
        kwargs.setdefault("error_messages", {"invalid": message, "null": message})
        super().__init__(**kwargs)

    def _deserialize(self, value: Any, attr: str | None, data: Any, **kwargs: Any) -> bool:
        if isinstance(value, bool):
            return value
        raise self.make_error("invalid")


class BoundedInt(fields.Field):
    """A JSON integer in [minimum, maximum]. Booleans, floats and strings are rejected."""

    def __init__(self, minimum: int, maximum: int, message: str, **kwargs: Any) -> None:
        kwargs.setdefault("error_messages", {"invalid": message, "null": REQUIRED})
        super().__init__(**kwargs)
        self.minimum = minimum
        self.maximum = maximum

    def _deserialize(self, value: Any, attr: str | None, data: Any, **kwargs: Any) -> int:
        if isinstance(value, bool) or not isinstance(value, int):
            raise self.make_error("invalid")
        if not self.minimum <= value <= self.maximum:
            raise self.make_error("invalid")
        return value
