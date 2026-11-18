"""Request and response schemas for the boards and membership API (BE03, DD9).

Requests use the shared string and email validators from `app.validation` (DD14), never the
auth blueprint. Each request schema rejects unknown fields. Each response schema lists its
fields in `Meta.fields`, so a service that passes extra keys cannot widen the wire contract.
Messages are fixed strings and never echo a submitted value.

The rules and messages mirror `specs/fixtures/board-field-cases.json`, which the backend and
frontend tests read.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from marshmallow import RAISE, Schema, ValidationError, fields, validate, validates_schema

from app.validation import (
    EMAIL_LENGTH,
    EMAIL_MAX,
    NOT_TEXT,
    REQUIRED,
    NormalizedString,
    TrimmedString,
    email_format,
)

BOARD_NAME_MAX = 100
BOARD_NAME_LENGTH = f"Must be 1 to {BOARD_NAME_MAX} characters."

_MESSAGES = {"required": REQUIRED, "null": REQUIRED, "invalid": NOT_TEXT}


SPRINT_MAX_DAYS = 90
SPRINT_DATE_INVALID = "Enter a valid date."
SPRINT_BOTH_DATES = "Enter both sprint dates."
SPRINT_END_BEFORE_START = "Must be on or after the start date."
SPRINT_TOO_LONG = f"Must be at most {SPRINT_MAX_DAYS} days long."

# ASCII digits only: `\d` also matches other Unicode digits, and `date.fromisoformat` accepts
# forms such as `20261116` and `2026-W47-1` that the API does not (DS6).
_DATE_PATTERN = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


class SprintDate(fields.Field):
    """A calendar date as `YYYY-MM-DD`. Any other value is one fixed message (DS6)."""

    def _deserialize(self, value: Any, attr: str | None, data: Any, **kwargs: Any) -> date:
        if not isinstance(value, str) or not _DATE_PATTERN.fullmatch(value):
            raise self.make_error("invalid")
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise self.make_error("invalid") from None


class _SprintSchema(Schema):
    """The optional sprint pair shared by E06 and E08 (Requirement 8).

    A key that is absent differs from a key that is `null`: on E08 absent means unchanged and both
    `null` clears the sprint. The pair rule runs only when every submitted field is valid on its
    own, so each message names one cause.
    """

    class Meta:
        unknown = RAISE

    sprint_start = SprintDate(allow_none=True, error_messages={"invalid": SPRINT_DATE_INVALID})
    sprint_end = SprintDate(allow_none=True, error_messages={"invalid": SPRINT_DATE_INVALID})

    @validates_schema(skip_on_field_errors=True)
    def check_sprint(self, data: dict[str, Any], **kwargs: Any) -> None:
        if "sprint_start" not in data and "sprint_end" not in data:
            return
        start, end = data.get("sprint_start"), data.get("sprint_end")
        if (start is None) != (end is None):
            missing = "sprint_end" if end is None else "sprint_start"
            raise ValidationError(SPRINT_BOTH_DATES, missing)
        if start is None:
            return  # both null: no sprint (E06) or clear it (E08)
        if end < start:
            raise ValidationError(SPRINT_END_BEFORE_START, "sprint_end")
        if (end - start).days >= SPRINT_MAX_DAYS:
            raise ValidationError(SPRINT_TOO_LONG, "sprint_end")


class BoardCreateSchema(_SprintSchema):
    """E06 body: `name` 1 to 100 characters after trimming and an optional sprint pair.

    Duplicates are allowed.
    """

    name = TrimmedString(
        required=True,
        error_messages=_MESSAGES,
        validate=validate.Length(min=1, max=BOARD_NAME_MAX, error=BOARD_NAME_LENGTH),
    )


class BoardUpdateSchema(_SprintSchema):
    """E08 body: `name`, the sprint pair, or both. At least one key is required (DS5).

    An empty body keeps `fields.name = "Required."`, the message it had when `name` was the only
    field.
    """

    name = TrimmedString(
        error_messages=_MESSAGES,
        validate=validate.Length(min=1, max=BOARD_NAME_MAX, error=BOARD_NAME_LENGTH),
    )

    # Reads the original body and runs after field errors, so a body of only unknown keys reports
    # both the unknown key and the missing `name`, as it did when `name` was the only field.
    @validates_schema(pass_original=True, skip_on_field_errors=False)
    def check_not_empty(self, data: dict[str, Any], original: Any, **kwargs: Any) -> None:
        submitted = original if isinstance(original, dict) else {}
        if not any(key in submitted for key in ("name", "sprint_start", "sprint_end")):
            raise ValidationError(REQUIRED, "name")


class MemberAddSchema(Schema):
    """E11 body: exactly `email`. Trimmed, lowercased and checked with the register email rule.

    Validation does not look up the board or the user (Requirements 4.6, 7.9).
    """

    class Meta:
        unknown = RAISE

    email = NormalizedString(
        required=True,
        error_messages=_MESSAGES,
        validate=[validate.Length(max=EMAIL_MAX, error=EMAIL_LENGTH), email_format],
    )


class MembershipSchema(Schema):
    """Membership_DTO for E10 and E11: exactly `user_id`, `name` and `role`."""

    user_id = fields.UUID(dump_only=True)
    name = fields.String(dump_only=True)
    role = fields.String(dump_only=True)

    class Meta:
        fields = ("user_id", "name", "role")


class BoardSummarySchema(Schema):
    """BoardSummary for E05, E06 and E08: the caller's role, the board version and the sprint."""

    id = fields.UUID(dump_only=True)
    name = fields.String(dump_only=True)
    role = fields.String(dump_only=True)
    position_version = fields.Integer(dump_only=True)
    sprint_start = fields.Date(dump_only=True, allow_none=True)
    sprint_end = fields.Date(dump_only=True, allow_none=True)

    class Meta:
        fields = ("id", "name", "role", "position_version", "sprint_start", "sprint_end")


class CardSchema(Schema):
    """Card inside E07. `assignee_name` comes from a join on `users.name`, never from email."""

    id = fields.UUID(dump_only=True)
    column_id = fields.UUID(dump_only=True)
    title = fields.String(dump_only=True)
    description = fields.String(dump_only=True, allow_none=True)
    assignee_id = fields.UUID(dump_only=True, allow_none=True)
    assignee_name = fields.String(dump_only=True, allow_none=True)
    order = fields.Float(dump_only=True)

    class Meta:
        fields = (
            "id",
            "column_id",
            "title",
            "description",
            "assignee_id",
            "assignee_name",
            "order",
        )


class ColumnSchema(Schema):
    """Column inside E07, with its active cards in order."""

    id = fields.UUID(dump_only=True)
    board_id = fields.UUID(dump_only=True)
    name = fields.String(dump_only=True)
    is_done = fields.Boolean(dump_only=True)
    order = fields.Float(dump_only=True)
    cards = fields.List(fields.Nested(CardSchema), dump_only=True)

    class Meta:
        fields = ("id", "board_id", "name", "is_done", "order", "cards")
