"""Request schemas and serializers of the kanban API (tasks 3.6 and 5.6).

Properties 2 (request schemas accept exactly their field set) and 11 (response allowlist). The
field cases come from `specs/fixtures/kanban-field-cases.json`, which the frontend rule tests read
as well. These tests call the schemas directly and need no database.
"""

from __future__ import annotations

import uuid

import pytest
from marshmallow import ValidationError

from app.blueprints.boards.schema import CardSchema
from app.blueprints.cards.schema import CardCreateSchema, CardPositionSchema, CardUpdateSchema
from app.blueprints.columns.schema import (
    ColumnCreateSchema,
    ColumnPlainSchema,
    ColumnReorderSchema,
    ColumnUpdateSchema,
)
from app.validation import first_messages
from tests.kanban_helpers import build_body, load_cases, resolve

CASES = load_cases()
COLUMN_SCHEMAS = {
    "column_create": ColumnCreateSchema,
    "column_update": ColumnUpdateSchema,
    "column_reorder": ColumnReorderSchema,
    "card_create": CardCreateSchema,
    "card_update": CardUpdateSchema,
    "card_position": CardPositionSchema,
}


def _param(form_name: str):
    return [
        pytest.param(form_name, case, id=f"{form_name}:{case['id']}")
        for case in CASES[form_name]["cases"]
    ]


def _jsonable(value):
    return str(value) if isinstance(value, uuid.UUID) else value


def _check(schema_class, form_name: str, case: dict) -> None:
    body = build_body(CASES[form_name], case)
    kind = next(iter(case["expect"]))
    if kind == "accepted":
        loaded = schema_class().load(body)
        expected = dict(body)
        expected.update({key: resolve(value) for key, value in case["expect"]["accepted"].items()})
        assert {key: _jsonable(value) for key, value in loaded.items()} == expected
        assert set(loaded) == set(body)
        return
    with pytest.raises(ValidationError) as raised:
        schema_class().load(body)
    messages = first_messages(raised.value.messages)
    if kind == "fields":
        assert messages == case["expect"]["fields"]
    else:
        assert messages == {}, "an empty PATCH body must be a body-level error without fields"


@pytest.mark.parametrize(
    ("form_name", "case"),
    _param("column_create") + _param("column_update") + _param("column_reorder"),
)
def test_property_2_column_request_schemas_follow_the_shared_cases(form_name, case):
    _check(COLUMN_SCHEMAS[form_name], form_name, case)


@pytest.mark.parametrize(
    ("form_name", "case"), _param("card_create") + _param("card_update") + _param("card_position")
)
def test_property_2_card_request_schemas_follow_the_shared_cases(form_name, case):
    _check(COLUMN_SCHEMAS[form_name], form_name, case)


def test_property_2_an_omitted_description_is_absent_from_an_edit():
    loaded = CardUpdateSchema().load({"title": "Only the title"})
    assert loaded == {"title": "Only the title"}


def test_property_2_the_version_ceiling_is_inclusive():
    body = {
        "column_id": str(uuid.uuid4()),
        "before_column_id": None,
        "expected_position_version": 2_147_483_647,
    }
    assert ColumnReorderSchema().load(body)["expected_position_version"] == 2_147_483_647
    body["expected_position_version"] = 2_147_483_648
    with pytest.raises(ValidationError):
        ColumnReorderSchema().load(body)


def test_property_11_column_response_has_exactly_the_documented_fields():
    leaky = {
        "id": uuid.uuid4(),
        "board_id": uuid.uuid4(),
        "name": "To do",
        "is_done": False,
        "order": 1024.0,
        "deleted_at": None,
        "created_at": "x",
        "password_hash": "x",
    }
    assert set(ColumnPlainSchema().dump(leaky)) == {"id", "board_id", "name", "is_done", "order"}


def test_property_11_card_response_has_exactly_the_documented_fields():
    leaky = {
        "id": uuid.uuid4(),
        "column_id": uuid.uuid4(),
        "title": "T",
        "description": None,
        "assignee_id": None,
        "assignee_name": None,
        "order": 1024.0,
        "deleted_at": None,
        "email": "a@b.c",
    }
    assert set(CardSchema().dump(leaky)) == {
        "id",
        "column_id",
        "title",
        "description",
        "assignee_id",
        "assignee_name",
        "order",
    }
