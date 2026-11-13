"""Request schemas for the card API E17–E20 (BE03). Responses reuse `CardSchema`/`ColumnSchema`.

Rules and messages mirror `specs/fixtures/kanban-field-cases.json`. A blank or whitespace-only
`description` is stored as null (L6). Requests reject unknown fields, and messages are fixed
strings that never echo a submitted value.
"""

from __future__ import annotations

from typing import Any

from marshmallow import RAISE, Schema, ValidationError, fields, validate, validates_schema

from app.blueprints.columns.schema import ID_MESSAGE, VERSION_MESSAGE
from app.positions import MAX_POSITION_VERSION
from app.validation import NOT_TEXT, REQUIRED, BoundedInt, TrimmedString

CARD_TITLE_MAX = 160
CARD_TITLE_LENGTH = f"Must be 1 to {CARD_TITLE_MAX} characters."
DESCRIPTION_MAX = 2000
DESCRIPTION_LENGTH = f"Must be at most {DESCRIPTION_MAX} characters."

_TEXT = {"required": REQUIRED, "null": REQUIRED, "invalid": NOT_TEXT}
_ID = {"required": REQUIRED, "null": REQUIRED, "invalid": ID_MESSAGE, "invalid_uuid": ID_MESSAGE}
_ID_OR_NULL = {"required": REQUIRED, "invalid": ID_MESSAGE, "invalid_uuid": ID_MESSAGE}
_DESCRIPTION = {"invalid": NOT_TEXT}


class DescriptionString(TrimmedString):
    """Trimmed text where a blank result is null, so "no description" has one representation."""

    def _deserialize(self, value: Any, attr: str | None, data: Any, **kwargs: Any) -> str | None:
        return super()._deserialize(value, attr, data, **kwargs) or None


def _description_length(value: str | None) -> None:
    if value is not None and len(value) > DESCRIPTION_MAX:
        raise ValidationError(DESCRIPTION_LENGTH)


def _title_field(**kwargs) -> TrimmedString:
    return TrimmedString(
        error_messages=_TEXT,
        validate=validate.Length(min=1, max=CARD_TITLE_MAX, error=CARD_TITLE_LENGTH),
        **kwargs,
    )


def _description_field() -> DescriptionString:
    return DescriptionString(
        allow_none=True, error_messages=_DESCRIPTION, validate=_description_length
    )


def _assignee_field() -> fields.UUID:
    return fields.UUID(allow_none=True, error_messages=_ID_OR_NULL)


class CardCreateSchema(Schema):
    """E17 body: `title`, optional nullable `description` and `assignee_id`."""

    class Meta:
        unknown = RAISE

    title = _title_field(required=True)
    description = _description_field()
    assignee_id = _assignee_field()


class CardUpdateSchema(Schema):
    """E18 body: any of `title`, `description`, `assignee_id`, at least one.

    An omitted field is absent from the loaded data, so the service keeps its current value.
    """

    class Meta:
        unknown = RAISE

    title = _title_field()
    description = _description_field()
    assignee_id = _assignee_field()

    @validates_schema
    def at_least_one_field(self, data, **kwargs):
        if not data:
            raise ValidationError("Provide at least one field.", "_schema")


class CardPositionSchema(Schema):
    """E20 body: the destination column, an explicit anchor (a card ID or null) and the version."""

    class Meta:
        unknown = RAISE

    column_id = fields.UUID(required=True, error_messages=_ID)
    before_card_id = fields.UUID(required=True, allow_none=True, error_messages=_ID_OR_NULL)
    expected_position_version = BoundedInt(
        0,
        MAX_POSITION_VERSION,
        VERSION_MESSAGE,
        required=True,
        error_messages={"required": REQUIRED, "null": REQUIRED, "invalid": VERSION_MESSAGE},
    )
