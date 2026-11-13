"""JSON request parsing and schema validation shared by every feature (BE03).

`request.get_json()` raises 415 for a wrong Content-Type, 413 above `MAX_CONTENT_LENGTH` and
400 for malformed JSON. The central handlers in `app.errors` turn those into the JSON envelope.
Field messages are fixed strings defined by each schema, so no message echoes an input value.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from flask import request
from marshmallow import Schema
from marshmallow import ValidationError as MarshmallowValidationError

from app.exceptions import RequestValidationError

BODY_MESSAGE = "The request body must be a JSON object."


def first_messages(messages: Mapping[str, Any]) -> dict[str, str]:
    """Keep one fixed message per field. Non-field entries such as `_schema` are dropped."""
    fields: dict[str, str] = {}
    for name, value in messages.items():
        if name.startswith("_"):
            continue
        message = value[0] if isinstance(value, list) and value else value
        if isinstance(message, str):
            fields[name] = message
    return fields


def load_json_body(schema: Schema) -> dict[str, Any]:
    """Parse the JSON object in the request and validate it with `schema`."""
    payload = request.get_json()
    if not isinstance(payload, dict):
        raise RequestValidationError(BODY_MESSAGE)
    try:
        return schema.load(payload)
    except MarshmallowValidationError as exc:
        fields = first_messages(exc.messages)
        if not fields:
            raise RequestValidationError(BODY_MESSAGE) from None
        raise RequestValidationError(fields=fields) from None
