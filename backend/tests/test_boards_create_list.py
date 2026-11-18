"""BT2 create and list tests for the boards API (task 2.7; Requirements 1.1-1.4, 1.9, 7.5).

E06 creates a board and the caller's admin membership in one transaction. E05 lists only the
caller's active boards, in name order and then ID order. Every test that writes uses the
`board_tracker` fixture, so teardown removes only the rows the test created.

Board names in the ordering tests start with different ASCII letters and have no case or accent
ties, so every database collation sorts them the same way (R11).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select

from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_member import BoardMember
from tests.auth_helpers import bearer

REQUIRED = "Required."
NOT_TEXT = "Must be text."
NAME_LENGTH = "Must be 1 to 100 characters."
UNKNOWN_FIELD = "Unknown field."


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def _soft_delete(app, model, row_id: uuid.UUID) -> None:
    """Set `deleted_at` on one row. Used to build hidden states the API cannot create."""
    with app.app_context():
        try:
            row = db.session.get(model, row_id)
            row.deleted_at = utcnow()
            db.session.commit()
        finally:
            db.session.remove()


def _rows_for(app, statement) -> list:
    with app.app_context():
        try:
            return list(db.session.scalars(statement))
        finally:
            db.session.remove()


def _boards_created_by(app, user_id: uuid.UUID) -> int:
    with app.app_context():
        try:
            return db.session.scalar(
                select(func.count()).select_from(Board).where(Board.creator_id == user_id)
            )
        finally:
            db.session.remove()


@pytest.mark.parametrize(
    ("submitted", "stored"),
    [
        pytest.param("A", "A", id="one-character"),
        pytest.param("  Team Alpha  ", "Team Alpha", id="outer-spaces-trimmed"),
        pytest.param("Team  Alpha", "Team  Alpha", id="inner-spaces-kept"),
        pytest.param("a" * 100, "a" * 100, id="one-hundred-characters"),
    ],
)
def test_create_returns_201_summary_and_admin_membership(
    client, app, board_tracker, submitted, stored
):
    user = board_tracker.make_user()
    token = board_tracker.token_for(user.id)

    response = client.post("/api/boards", json={"name": submitted}, headers=bearer(token))

    assert response.status_code == 201
    assert response.headers["Cache-Control"] == "private, no-store"
    data = response.get_json()["data"]
    assert set(data) == {"id", "name", "role", "position_version", "sprint_start", "sprint_end"}
    assert data["name"] == stored
    assert data["role"] == "admin"
    board_id = board_tracker.record_board_from_response(response)

    board_rows = _rows_for(app, select(Board).where(Board.id == board_id))
    assert len(board_rows) == 1
    assert board_rows[0].name == stored
    assert board_rows[0].deleted_at is None
    assert data["position_version"] == board_rows[0].position_version

    memberships = _rows_for(
        app,
        select(BoardMember).where(BoardMember.board_id == board_id),
    )
    assert [(m.user_id, m.role, m.deleted_at) for m in memberships] == [(user.id, "admin", None)]


@pytest.mark.parametrize(
    ("body", "fields"),
    [
        pytest.param({}, {"name": REQUIRED}, id="name-missing"),
        pytest.param({"name": ""}, {"name": NAME_LENGTH}, id="name-empty"),
        pytest.param({"name": "   "}, {"name": NAME_LENGTH}, id="name-spaces-only"),
        pytest.param({"name": "a" * 101}, {"name": NAME_LENGTH}, id="name-101-characters"),
        pytest.param({"name": 123}, {"name": NOT_TEXT}, id="name-not-text"),
        pytest.param(
            {"name": "Team", "color": "red"},
            {"color": UNKNOWN_FIELD},
            id="unknown-field",
        ),
    ],
)
def test_create_rejects_invalid_body_and_creates_nothing(client, app, board_tracker, body, fields):
    user = board_tracker.make_user()
    token = board_tracker.token_for(user.id)

    response = client.post("/api/boards", json=body, headers=bearer(token))

    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["fields"] == fields
    assert _boards_created_by(app, user.id) == 0


def test_create_accepts_duplicate_names_as_separate_boards(client, app, board_tracker):
    user = board_tracker.make_user()
    token = board_tracker.token_for(user.id)

    first = client.post("/api/boards", json={"name": "Sprint"}, headers=bearer(token))
    second = client.post("/api/boards", json={"name": "Sprint"}, headers=bearer(token))

    first_id = board_tracker.record_board_from_response(first)
    second_id = board_tracker.record_board_from_response(second)
    assert first_id != second_id
    assert first.get_json()["data"]["name"] == second.get_json()["data"]["name"] == "Sprint"
    assert _boards_created_by(app, user.id) == 2


def test_list_returns_only_active_memberships_in_name_order(client, app, board_tracker):
    user = board_tracker.make_user()
    other = board_tracker.make_user()
    token = board_tracker.token_for(user.id)

    # Visible: created out of name order so the response must sort them.
    charlie = board_tracker.make_board(other.id, "charlie")
    board_tracker.make_membership(charlie, user.id, "member")
    alpha = board_tracker.make_board(other.id, "alpha")
    board_tracker.make_membership(alpha, user.id, "admin")
    bravo = board_tracker.make_board(other.id, "bravo")
    board_tracker.make_membership(bravo, user.id, "member")

    # Hidden: the caller is a nonmember.
    delta = board_tracker.make_board(other.id, "delta")
    board_tracker.make_membership(delta, other.id, "admin")
    # Hidden: the board is soft-deleted although the membership is active.
    echo = board_tracker.make_board(other.id, "echo")
    board_tracker.make_membership(echo, user.id, "member")
    _soft_delete(app, Board, echo)
    # Hidden: the caller's membership is soft-deleted.
    foxtrot = board_tracker.make_board(other.id, "foxtrot")
    foxtrot_membership = board_tracker.make_membership(foxtrot, user.id, "member")
    _soft_delete(app, BoardMember, foxtrot_membership)

    response = client.get("/api/boards", headers=bearer(token))

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, no-store"
    items = response.get_json()["data"]
    assert [(item["name"], item["role"]) for item in items] == [
        ("alpha", "admin"),
        ("bravo", "member"),
        ("charlie", "member"),
    ]
    assert [item["id"] for item in items] == [str(alpha), str(bravo), str(charlie)]
    assert all(
        set(item) == {"id", "name", "role", "position_version", "sprint_start", "sprint_end"}
        for item in items
    )


def test_list_breaks_equal_names_by_board_id(client, app, board_tracker):
    user = board_tracker.make_user()
    other = board_tracker.make_user()
    token = board_tracker.token_for(user.id)
    first_tie = board_tracker.make_board(other.id, "bravo")
    second_tie = board_tracker.make_board(other.id, "bravo")
    alpha = board_tracker.make_board(other.id, "alpha")
    for board_id in (first_tie, second_tie, alpha):
        board_tracker.make_membership(board_id, user.id, "member")

    response = client.get("/api/boards", headers=bearer(token))

    assert response.status_code == 200
    ids = [item["id"] for item in response.get_json()["data"]]
    assert ids == [str(alpha), *(str(board_id) for board_id in sorted([first_tie, second_tie]))]


def test_list_is_empty_for_a_user_without_memberships(client, board_tracker):
    user = board_tracker.make_user()
    token = board_tracker.token_for(user.id)

    response = client.get("/api/boards", headers=bearer(token))

    assert response.status_code == 200
    assert response.get_json() == {"data": []}
