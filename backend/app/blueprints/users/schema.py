"""Public user DTO: an explicit allowlist of `id`, `name` and `email` (BE03, D3)."""

from marshmallow import Schema, fields


class PublicUserSchema(Schema):
    id = fields.UUID()
    name = fields.String()
    email = fields.String()

    class Meta:
        fields = ("id", "name", "email")
