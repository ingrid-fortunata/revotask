"""BT1 schema tests for the boards API (task 2.6; Requirements 1.2, 3.4, 4.6, 4.8, 7.3, 7.5).

The board name and member email rules run on specs/fixtures/board-field-cases.json, the same file
the frontend boardRules tests read. The E08 name rule is the E06 rule, so the board_create cases
also run against BoardUpdateSchema. These are pure schema tests: they need no database and no app.
"""

import json
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from marshmallow import ValidationError

from app.blueprints.boards.schema import (
    BoardCreateSchema,
    BoardSummarySchema,
    BoardUpdateSchema,
    CardSchema,
    ColumnSchema,
    MemberAddSchema,
    MembershipSchema,
)
from app.validation import first_messages
from tests.auth_cases import expand

CASES_PATH = Path(__file__).resolve().parents[2] / "specs" / "fixtures" / "board-field-cases.json"
UNKNOWN_FIELD = "Unknown field."

USER_ID = uuid.UUID("0b6f3c1e-8f2a-4d7b-9a3e-1c2d3e4f5a6b")
BOARD_ID = uuid.UUID("5c7d9e1f-2a3b-4c5d-8e9f-0a1b2c3d4e5f")
COLUMN_ID = uuid.UUID("6d8e0f2a-3b4c-4d6e-9f0a-1b2c3d4e5f60")
CARD_ID = uuid.UUID("7e9f1a3b-4c5d-4e7f-8a1b-2c3d4e5f6071")


def _shared_cases(form):
    """Expand one form's cases into pytest params, the same way auth_cases.load_cases does."""
    data = json.loads(CASES_PATH.read_text(encoding="utf-8"))[form]
    base = expand(data["base"])
    params = []
    for case in data["cases"]:
        body = {**base, **expand(case["set"])}
        for key in case["drop"]:
            body.pop(key, None)
        params.append(pytest.param(body, expand(case["expect"]), id=case["id"]))
    return params


def _load(schema_cls, body):
    try:
        return schema_cls().load(body), None
    except ValidationError as exc:
        return None, first_messages(exc.messages)


def _check(schema_cls, body, expect, keys):
    loaded, messages = _load(schema_cls, body)
    if "fields" in expect:
        assert loaded is None, f"accepted a body the fixture rejects: {loaded}"
        assert messages == expect["fields"]
        return
    assert messages is None, messages
    assert set(loaded) == keys
    for name, value in expect["accepted"].items():
        assert loaded[name] == value


@pytest.mark.parametrize(("body", "expect"), _shared_cases("board_create"))
def test_board_create_matches_shared_name_cases(body, expect):
    _check(BoardCreateSchema, body, expect, {"name"})


@pytest.mark.parametrize(("body", "expect"), _shared_cases("board_create"))
def test_board_update_uses_the_same_name_rule(body, expect):
    _check(BoardUpdateSchema, body, expect, {"name"})


@pytest.mark.parametrize(("body", "expect"), _shared_cases("member_add"))
def test_member_add_matches_shared_email_cases(body, expect):
    _check(MemberAddSchema, body, expect, {"email"})


@pytest.mark.parametrize("form", ["board_create", "member_add"])
def test_shared_case_ids_are_unique(form):
    ids = [param.id for param in _shared_cases(form)]
    assert len(ids) == len(set(ids))


REQUEST_BASES = (
    ("board-create", BoardCreateSchema, {"name": "Team Alpha"}),
    ("board-update", BoardUpdateSchema, {"name": "Team Alpha"}),
    ("member-add", MemberAddSchema, {"email": "ada@example.com"}),
)
UNKNOWN_KEYS = ("role", "email", "password_hash", "deleted_at", "id", "creator_id")
# A key that is already a field of the schema is not unknown, so it is skipped for that schema.
UNKNOWN_CASES = [
    pytest.param(schema_cls, base, key, id=f"{label}-{key}")
    for label, schema_cls, base in REQUEST_BASES
    for key in UNKNOWN_KEYS
    if key not in base
]


@pytest.mark.parametrize(("schema_cls", "base", "key"), UNKNOWN_CASES)
def test_request_schemas_reject_unknown_fields(schema_cls, base, key):
    _, messages = _load(schema_cls, {**base, key: "injected"})
    assert messages == {key: UNKNOWN_FIELD}


@pytest.mark.parametrize(
    ("schema_cls", "body"),
    [
        (BoardCreateSchema, {"name": "x" * 150, "unexpected": "leak-sentinel-7319"}),
        (BoardUpdateSchema, {"name": 5, "unexpected": "leak-sentinel-7319"}),
        (MemberAddSchema, {"email": "leak-sentinel-7319@", "password_hash": "x"}),
    ],
    ids=["board-create", "board-update", "member-add"],
)
def test_error_messages_never_echo_the_submitted_value(schema_cls, body):
    _, messages = _load(schema_cls, body)
    assert messages
    assert "leak-sentinel-7319" not in json.dumps(messages)


def test_membership_dump_is_limited_to_user_id_name_and_role():
    row = SimpleNamespace(
        user_id=USER_ID,
        name="Ada",
        role="admin",
        email="ada@example.com",
        password_hash="$argon2id$secret",
        created_at="2024-01-01T00:00:00Z",
        deleted_at=None,
    )
    assert MembershipSchema().dump(row) == {"user_id": str(USER_ID), "name": "Ada", "role": "admin"}


def test_board_summary_dump_is_limited_to_documented_fields():
    row = SimpleNamespace(
        id=BOARD_ID,
        name="Team Alpha",
        role="admin",
        position_version=3,
        creator_id=USER_ID,
        deleted_at=None,
        updated_at="2024-01-01T00:00:00Z",
    )
    assert BoardSummarySchema().dump(row) == {
        "id": str(BOARD_ID),
        "name": "Team Alpha",
        "role": "admin",
        "position_version": 3,
    }


@pytest.mark.parametrize(
    ("description", "assignee_id", "assignee_name"),
    [("Write the notes", USER_ID, "Ada"), (None, None, None)],
    ids=["assigned", "cleared"],
)
def test_card_dump_drops_extra_keys_and_keeps_nullable_fields(
    description, assignee_id, assignee_name
):
    row = SimpleNamespace(
        id=CARD_ID,
        column_id=COLUMN_ID,
        title="Draft",
        description=description,
        assignee_id=assignee_id,
        assignee_name=assignee_name,
        order=2,
        assignee_email="ada@example.com",
        deleted_at=None,
        created_at="2024-01-01T00:00:00Z",
    )
    assert CardSchema().dump(row) == {
        "id": str(CARD_ID),
        "column_id": str(COLUMN_ID),
        "title": "Draft",
        "description": description,
        "assignee_id": str(assignee_id) if assignee_id else None,
        "assignee_name": assignee_name,
        "order": 2,
    }


def test_column_dump_nests_cards_with_the_card_allowlist():
    card = SimpleNamespace(
        id=CARD_ID,
        column_id=COLUMN_ID,
        title="Draft",
        description=None,
        assignee_id=None,
        assignee_name=None,
        order=1,
        deleted_at="2024-01-02T00:00:00Z",
        assignee_email="ada@example.com",
    )
    column = SimpleNamespace(
        id=COLUMN_ID,
        board_id=BOARD_ID,
        name="Todo",
        is_done=False,
        order=1,
        cards=[card],
        deleted_at=None,
        created_at="2024-01-01T00:00:00Z",
    )
    assert ColumnSchema().dump(column) == {
        "id": str(COLUMN_ID),
        "board_id": str(BOARD_ID),
        "name": "Todo",
        "is_done": False,
        "order": 1,
        "cards": [
            {
                "id": str(CARD_ID),
                "column_id": str(COLUMN_ID),
                "title": "Draft",
                "description": None,
                "assignee_id": None,
                "assignee_name": None,
                "order": 1,
            }
        ],
    }
