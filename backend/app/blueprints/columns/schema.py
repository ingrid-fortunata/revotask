"""Request and response schemas for the column API E13–E16 (BE03).

Rules and messages mirror `specs/fixtures/kanban-field-cases.json`, which the backend and
frontend tests read. Requests reject unknown fields. Messages are fixed strings and never echo a
submitted value. The response schema lists its fields in `Meta.fields`.
"""

from __future__ import annotations

from marshmallow import RAISE, Schema, ValidationError, fields, validate, validates_schema

from app.positions import MAX_POSITION_VERSION
from app.validation import NOT_TEXT, REQUIRED, BoundedInt, StrictBool, TrimmedString

COLUMN_NAME_MAX = 80
COLUMN_NAME_LENGTH = f"Must be 1 to {COLUMN_NAME_MAX} characters."
BOOL_MESSAGE = "Must be true or false."
ID_MESSAGE = "Must be a valid ID."
VERSION_MESSAGE = f"Must be a whole number from 0 to {MAX_POSITION_VERSION}."

_TEXT = {"required": REQUIRED, "null": REQUIRED, "invalid": NOT_TEXT}
_ID = {"required": REQUIRED, "null": REQUIRED, "invalid": ID_MESSAGE, "invalid_uuid": ID_MESSAGE}
_ID_OR_NULL = {"required": REQUIRED, "invalid": ID_MESSAGE, "invalid_uuid": ID_MESSAGE}


def _name_field(**kwargs) -> TrimmedString:
    return TrimmedString(
        error_messages=_TEXT,
        validate=validate.Length(min=1, max=COLUMN_NAME_MAX, error=COLUMN_NAME_LENGTH),
        **kwargs,
    )


class ColumnCreateSchema(Schema):
    """E13 body: `name` and an optional boolean `is_done`. The route defaults it to false."""

    class Meta:
        unknown = RAISE

    name = _name_field(required=True)
    is_done = StrictBool(BOOL_MESSAGE)


class ColumnUpdateSchema(Schema):
    """E14 body: `name` and/or `is_done`, at least one. An empty body is a body-level 400."""

    class Meta:
        unknown = RAISE

    name = _name_field()
    is_done = StrictBool(BOOL_MESSAGE)

    @validates_schema
    def at_least_one_field(self, data, **kwargs):
        if not data:
            # `_schema` errors carry no field, so the response is a body-level 400.
            raise ValidationError("Provide at least one field.", "_schema")


class ColumnReorderSchema(Schema):
    """E16 body: the moved column, an explicit anchor (a column ID or null) and the version."""

    class Meta:
        unknown = RAISE

    column_id = fields.UUID(required=True, error_messages=_ID)
    before_column_id = fields.UUID(required=True, allow_none=True, error_messages=_ID_OR_NULL)
    expected_position_version = BoundedInt(
        0,
        MAX_POSITION_VERSION,
        VERSION_MESSAGE,
        required=True,
        error_messages={
            "required": REQUIRED,
            "null": REQUIRED,
            "invalid": VERSION_MESSAGE,
        },
    )


class ColumnPlainSchema(Schema):
    """Column for E13, E14 and E16: no cards."""

    id = fields.UUID(dump_only=True)
    board_id = fields.UUID(dump_only=True)
    name = fields.String(dump_only=True)
    is_done = fields.Boolean(dump_only=True)
    order = fields.Float(dump_only=True)

    class Meta:
        fields = ("id", "board_id", "name", "is_done", "order")
