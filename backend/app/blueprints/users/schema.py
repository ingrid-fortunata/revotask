"""Public user DTO and the profile update request (BE03, D3).

`PublicUserSchema` is an explicit allowlist of `id`, `name` and `email`. `ProfileUpdateSchema`
(E31) accepts `name`, the pair `current_password` and `new_password`, or both. The name follows
the E02 rule, the new password the E02 register rule and the current password the E03 login rule,
all from the same validators as registration. The email is the fixed login key, so it is not a
declared field and any `email` key is `Unknown field.` (P12). Passwords are never trimmed.
`specs/fixtures/auth-field-cases.json` (the `profile` section) runs the same cases in the UI
tests, so a difference fails a test.
"""

from typing import Any

from marshmallow import RAISE, Schema, ValidationError, fields, validate, validates_schema

from app.blueprints.auth.schema import (
    LOGIN_PASSWORD_LENGTH,
    NAME_LENGTH,
    REGISTER_PASSWORD_LENGTH,
    password_composition,
)
from app.config import NAME_MAX, PASSWORD_MAX, PASSWORD_MIN
from app.validation import FIELD_MESSAGES, REQUIRED, TrimmedString

PASSWORD_PAIR = ("current_password", "new_password")


class PublicUserSchema(Schema):
    id = fields.UUID()
    name = fields.String()
    email = fields.String()

    class Meta:
        fields = ("id", "name", "email")


class ProfileUpdateSchema(Schema):
    """`name`, `current_password` and `new_password`. Any other key is `Unknown field.`"""

    class Meta:
        unknown = RAISE

    name = TrimmedString(
        error_messages=FIELD_MESSAGES,
        validate=validate.Length(min=1, max=NAME_MAX, error=NAME_LENGTH),
    )
    current_password = fields.String(
        error_messages=FIELD_MESSAGES,
        validate=validate.Length(min=1, max=PASSWORD_MAX, error=LOGIN_PASSWORD_LENGTH),
    )
    new_password = fields.String(
        error_messages=FIELD_MESSAGES,
        validate=[
            validate.Length(min=PASSWORD_MIN, max=PASSWORD_MAX, error=REGISTER_PASSWORD_LENGTH),
            password_composition,
        ],
    )

    @validates_schema(pass_original=True, skip_on_field_errors=False)
    def both_or_neither(self, _data: dict[str, Any], original: Any, **_kwargs: Any) -> None:
        """The password pair comes together: the missing half is `Required.` (P13)."""
        if not isinstance(original, dict):
            return
        present = [key for key in PASSWORD_PAIR if key in original]
        if len(present) == 1:
            missing = next(key for key in PASSWORD_PAIR if key not in present)
            raise ValidationError(REQUIRED, missing)
