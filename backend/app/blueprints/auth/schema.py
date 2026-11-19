"""Request schemas for register and login (BE03).

The rules and the fixed messages mirror frontend/lib/authRules.ts. Both read
specs/fixtures/auth-field-cases.json in their tests, so a difference fails a test. Lengths
count Unicode code points. Messages never contain the submitted value.

The generic validators (trimmed and normalized strings, the not-blank and email-format rules)
live in `app.validation` (DD14). Only the auth-specific rules stay in this module.
"""

from __future__ import annotations

import re

from marshmallow import RAISE, Schema, ValidationError, fields, validate

from app.config import NAME_MAX, PASSWORD_MAX, PASSWORD_MIN
from app.validation import (
    EMAIL_LENGTH,
    EMAIL_MAX,
    FIELD_MESSAGES,
    NormalizedString,
    TrimmedString,
    email_format,
    not_blank,
)
from app.validation import normalize_email as normalize_email  # re-exported for auth callers

NAME_LENGTH = f"Must be 1 to {NAME_MAX} characters."
REGISTER_PASSWORD_LENGTH = f"Must be {PASSWORD_MIN} to {PASSWORD_MAX} characters."
PASSWORD_COMPOSITION = (
    "Must include an uppercase letter, a lowercase letter and a special character."
)
LOGIN_PASSWORD_LENGTH = f"Must be 1 to {PASSWORD_MAX} characters."

# Password composition (register only). ASCII only, so accented letters and emoji do not count.
# Special characters are the ASCII punctuation ranges 0x21-0x2F, 0x3A-0x40, 0x5B-0x60, 0x7B-0x7E.
# A space is not a special character.
PASSWORD_UPPERCASE = re.compile(r"[A-Z]")
PASSWORD_LOWERCASE = re.compile(r"[a-z]")
PASSWORD_SPECIAL = re.compile(r"[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]")

_MESSAGES = FIELD_MESSAGES


def password_composition(value: str) -> None:
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
        validate=[validate.Length(max=EMAIL_MAX, error=EMAIL_LENGTH), email_format],
    )
    password = fields.String(
        required=True,
        error_messages=_MESSAGES,
        # Length first, then composition: the first message reported matches authRules.ts.
        validate=[
            validate.Length(min=PASSWORD_MIN, max=PASSWORD_MAX, error=REGISTER_PASSWORD_LENGTH),
            password_composition,
        ],
    )


class LoginSchema(Schema):
    """Exactly `email` and `password`. No format or minimum-length check (AUTH-AC2.4)."""

    class Meta:
        unknown = RAISE

    email = NormalizedString(
        required=True,
        error_messages=_MESSAGES,
        validate=[not_blank, validate.Length(max=EMAIL_MAX, error=EMAIL_LENGTH)],
    )
    password = fields.String(
        required=True,
        error_messages=_MESSAGES,
        validate=validate.Length(min=1, max=PASSWORD_MAX, error=LOGIN_PASSWORD_LENGTH),
    )
