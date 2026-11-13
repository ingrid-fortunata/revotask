"""Request and response schemas for the boards and membership API (BE03, DD9).

Requests use the shared string and email validators from `app.validation` (DD14), never the
auth blueprint. Each request schema rejects unknown fields. Each response schema lists its
fields in `Meta.fields`, so a service that passes extra keys cannot widen the wire contract.
Messages are fixed strings and never echo a submitted value.

The rules and messages mirror `specs/fixtures/board-field-cases.json`, which the backend and
frontend tests read.
"""

from __future__ import annotations

from marshmallow import RAISE, Schema, fields, validate

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


class BoardCreateSchema(Schema):
    """E06 body: exactly `name`, 1 to 100 characters after trimming. Duplicates are allowed."""

    class Meta:
        unknown = RAISE

    name = TrimmedString(
        required=True,
        error_messages=_MESSAGES,
        validate=validate.Length(min=1, max=BOARD_NAME_MAX, error=BOARD_NAME_LENGTH),
    )


class BoardUpdateSchema(Schema):
    """E08 body: exactly `name`, required. An empty body is `Required.`."""

    class Meta:
        unknown = RAISE

    name = TrimmedString(
        required=True,
        error_messages=_MESSAGES,
        validate=validate.Length(min=1, max=BOARD_NAME_MAX, error=BOARD_NAME_LENGTH),
    )


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
    """BoardSummary for E05, E06 and E08: the caller's role and the board version."""

    id = fields.UUID(dump_only=True)
    name = fields.String(dump_only=True)
    role = fields.String(dump_only=True)
    position_version = fields.Integer(dump_only=True)

    class Meta:
        fields = ("id", "name", "role", "position_version")


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
