"""Public user DTO and the profile update request (BE03, D3).

`PublicUserSchema` is an explicit allowlist of `id`, `name` and `email`. `ProfileUpdateSchema`
(E31) applies the E02 name and email rules to the keys that are sent. The rules and messages
come from the same validators as registration, and `specs/fixtures/auth-field-cases.json` (the
`profile` section) runs the same cases in the UI tests, so a difference fails a test.
"""

from marshmallow import RAISE, Schema, fields, validate

from app.blueprints.auth.schema import NAME_LENGTH
from app.config import NAME_MAX
from app.validation import (
    EMAIL_LENGTH,
    EMAIL_MAX,
    FIELD_MESSAGES,
    NormalizedString,
    TrimmedString,
    email_format,
)


class PublicUserSchema(Schema):
    id = fields.UUID()
    name = fields.String()
    email = fields.String()

    class Meta:
        fields = ("id", "name", "email")


class ProfileUpdateSchema(Schema):
    """`name`, `email` or both. Any other key is `Unknown field.` (`password` included)."""

    class Meta:
        unknown = RAISE

    name = TrimmedString(
        error_messages=FIELD_MESSAGES,
        validate=validate.Length(min=1, max=NAME_MAX, error=NAME_LENGTH),
    )
    email = NormalizedString(
        error_messages=FIELD_MESSAGES,
        validate=[validate.Length(max=EMAIL_MAX, error=EMAIL_LENGTH), email_format],
    )
