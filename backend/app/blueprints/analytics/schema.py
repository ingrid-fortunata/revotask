"""Query and response schemas for the board analytics API E29 (T14, DD1, DD8).

E29 accepts no query parameter, so the query schema has no fields and `load_query_args` rejects
every key. The response schemas are dump-only allowlists: no event ID, card ID, comment text or
email can appear.
"""

from __future__ import annotations

from marshmallow import Schema, fields


class AnalyticsQuerySchema(Schema):
    """E29 query: none. Any key is unknown and is a 400."""


class ColumnCountSchema(Schema):
    column_id = fields.UUID(dump_only=True)
    name = fields.String(dump_only=True)
    count = fields.Integer(dump_only=True)

    class Meta:
        ordered = True


class ActivityCountSchema(Schema):
    user_id = fields.UUID(dump_only=True)
    name = fields.String(dump_only=True)
    count = fields.Integer(dump_only=True)

    class Meta:
        ordered = True


class AnalyticsSchema(Schema):
    week_start = fields.String(dump_only=True)
    week_end = fields.String(dump_only=True)
    cards_per_column = fields.Nested(ColumnCountSchema, many=True, dump_only=True)
    completed_cards = fields.Integer(dump_only=True)
    member_activity = fields.Nested(ActivityCountSchema, many=True, dump_only=True)

    class Meta:
        ordered = True
