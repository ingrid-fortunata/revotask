"""Request schemas for register and login (BE03).

The rules and the fixed messages mirror frontend/lib/authRules.ts. Both read
specs/fixtures/auth-field-cases.json in their tests, so a difference fails a test. Lengths
count Unicode code points. Messages never contain the submitted value.
"""

from __future__ import annotations

import re
from typing import Any

from marshmallow import RAISE, Schema, ValidationError, fields, validate

from app.config import EMAIL_MAX, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN

REQUIRED = "Required."
NOT_TEXT = "Must be text."
UNKNOWN = "Unknown field."
NAME_LENGTH = f"Must be 1 to {NAME_MAX} characters."
EMAIL_LENGTH = f"Must be at most {EMAIL_MAX} characters."
EMAIL_FORMAT = "Enter a valid email address."
REGISTER_PASSWORD_LENGTH = f"Must be {PASSWORD_MIN} to {PASSWORD_MAX} characters."
PASSWORD_COMPOSITION = (
    "Must include an uppercase letter, a lowercase letter and a special character."
)
LOGIN_PASSWORD_LENGTH = f"Must be 1 to {PASSWORD_MAX} characters."

# One simple rule, written the same way in frontend/lib/authRules.ts.
EMAIL_PATTERN = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
# Password composition (register only). ASCII only, so accented letters and emoji do not count.
# Special characters are the ASCII punctuation ranges 0x21-0x2F, 0x3A-0x40, 0x5B-0x60, 0x7B-0x7E.
# A space is not a special character.
PASSWORD_UPPERCASE = re.compile(r"[A-Z]")
PASSWORD_LOWERCASE = re.compile(r"[a-z]")
PASSWORD_SPECIAL = re.compile(r"[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]")

_MESSAGES = {"required": REQUIRED, "null": REQUIRED, "invalid": NOT_TEXT}


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


def _not_blank(value: str) -> None:
    if not value:
        raise ValidationError(REQUIRED)


def _email_format(value: str) -> None:
    if not EMAIL_PATTERN.fullmatch(value):
        raise ValidationError(EMAIL_FORMAT)


def _password_composition(value: str) -> None:
    if not (
        PASSWORD_UPPERCASE.search(value)
        and PASSWORD_LOWERCASE.search(value)
        and PASSWORD_SPECIAL.search(value)
    ):
        raise ValidationError(PASSWORD_COMPOSITION)


class RegisterSchema(Schema):
    """Exactly `name`, `email` and `password`. Any other key is `Unknown field.`"""

    class Meta:
        unknown = RAISE

    name = TrimmedString(
        required=True,
        error_messages=_MESSAGES,
        validate=validate.Length(min=1, max=NAME_MAX, error=NAME_LENGTH),
    )
    email = NormalizedString(
        required=True,
        error_messages=_MESSAGES,
        validate=[validate.Length(max=EMAIL_MAX, error=EMAIL_LENGTH), _email_format],
    )
    password = fields.String(
        required=True,
        error_messages=_MESSAGES,
        # Length first, then composition: the first message reported matches authRules.ts.
        validate=[
            validate.Length(min=PASSWORD_MIN, max=PASSWORD_MAX, error=REGISTER_PASSWORD_LENGTH),
            _password_composition,
        ],
    )


class LoginSchema(Schema):
    """Exactly `email` and `password`. No format or minimum-length check (AUTH-AC2.4)."""

    class Meta:
        unknown = RAISE

    email = NormalizedString(
        required=True,
        error_messages=_MESSAGES,
        validate=[_not_blank, validate.Length(max=EMAIL_MAX, error=EMAIL_LENGTH)],
    )
    password = fields.String(
        required=True,
        error_messages=_MESSAGES,
        validate=validate.Length(min=1, max=PASSWORD_MAX, error=LOGIN_PASSWORD_LENGTH),
    )
