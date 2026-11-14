"""Request and response schemas for the comments API E23–E26 (BE03).

The rule and its message mirror `specs/fixtures/comment-field-cases.json`, which the backend and
frontend tests read. Content is trimmed text of 1 to 2,000 characters and keeps its inner line
breaks. Requests reject unknown fields. Messages are fixed strings and never echo the content.
The response schema lists its fields in `Meta.fields`.
"""

from __future__ import annotations

from marshmallow import RAISE, Schema, fields, validate

from app.validation import NOT_TEXT, REQUIRED, TrimmedString, UtcDateTime

COMMENT_MAX = 2000
CONTENT_LENGTH = f"Must be 1 to {COMMENT_MAX} characters."


class CommentContentSchema(Schema):
    """E24 and E25 body: exactly `content`."""

    class Meta:
        unknown = RAISE

    content = TrimmedString(
        required=True,
        error_messages={"required": REQUIRED, "null": REQUIRED, "invalid": NOT_TEXT},
        validate=validate.Length(min=1, max=COMMENT_MAX, error=CONTENT_LENGTH),
    )


class CommentSchema(Schema):
    """The Comment shape of `docs/API.md`. `author_name` is the author's current name."""

    class Meta:
        fields = (
            "id",
            "card_id",
            "author_id",
            "author_name",
            "content",
            "created_at",
            "updated_at",
        )

    id = fields.UUID()
    card_id = fields.UUID()
    author_id = fields.UUID()
    author_name = fields.String()
    content = fields.String()
    created_at = UtcDateTime()
    updated_at = UtcDateTime()
