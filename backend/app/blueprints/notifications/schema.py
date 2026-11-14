"""Query and response schemas for the notification API E27–E28 (T13, DD4, DD8).

`page` and `per_page` arrive as URL text, so `QueryInt` accepts only plain ASCII digits: no sign,
no space, no decimal, no hex, no exponent, no leading zero and at most 10 digits. Messages are
fixed strings and never echo the input. The response schema is a dump-only allowlist.
"""

from __future__ import annotations

import re
from typing import Any

from marshmallow import Schema, fields

from app.validation import REQUIRED, UtcDateTime

PAGE_MAX = 2_147_483_647
PER_PAGE_MAX = 50
PAGE_MESSAGE = f"Must be a whole number from 1 to {PAGE_MAX}."
PER_PAGE_MESSAGE = f"Must be a whole number from 1 to {PER_PAGE_MAX}."

_DIGITS = re.compile(r"(0|[1-9][0-9]{0,9})")


class QueryInt(fields.Field):
    """A whole number written as plain digits in the URL, within [minimum, maximum]."""

    def __init__(self, minimum: int, maximum: int, message: str, **kwargs: Any) -> None:
        kwargs.setdefault("error_messages", {"invalid": message, "null": REQUIRED})
        super().__init__(**kwargs)
        self.minimum = minimum
        self.maximum = maximum

    def _deserialize(self, value: Any, attr: str | None, data: Any, **kwargs: Any) -> int:
        # fullmatch, not match: `$` would accept a trailing newline.
        if not isinstance(value, str) or _DIGITS.fullmatch(value) is None:
            raise self.make_error("invalid")
        number = int(value)
        if not self.minimum <= number <= self.maximum:
            raise self.make_error("invalid")
        return number


class NotificationListQuerySchema(Schema):
    """E27 query: optional `page` (default 1) and `per_page` (default 20)."""

    page = QueryInt(1, PAGE_MAX, PAGE_MESSAGE, load_default=1)
    per_page = QueryInt(1, PER_PAGE_MAX, PER_PAGE_MESSAGE, load_default=20)


class NotificationSchema(Schema):
    """The Notification shape of `docs/API.md`, with the display fields (B1, C33). Dump only."""

    class Meta:
        fields = (
            "id",
            "kind",
            "board_id",
            "card_id",
            "actor_id",
            "actor_name",
            "board_name",
            "card_title",
            "created_at",
            "read_at",
        )

    id = fields.UUID()
    kind = fields.String()
    board_id = fields.UUID()
    card_id = fields.UUID()
    actor_id = fields.UUID()
    actor_name = fields.String()
    board_name = fields.String()
    card_title = fields.String()
    created_at = UtcDateTime()
    read_at = UtcDateTime()
