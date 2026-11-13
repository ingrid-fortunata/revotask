"""Parameterized tests for boards Properties 4-7 (task 2.16; Requirements 1.3, 1.4, 2.1, 2.2,
2.4, 2.5, 2.6, 3.6, 5.2, 7.1, 7.10). Design DD1, DD3 and DD9. Guidelines BE04, BE05 and BE07.

Each test docstring carries its tag, `Feature: boards-membership, Property N: <title>`.

- Property 4: board listing visibility and order (E05).
- Property 5: board detail filtering and order (E07).
- Property 6: inaccessible boards are indistinguishable (E07 to E12).
- Property 7: non-UUID identifiers are rejected before lookup (E07 to E12).

Inputs come from enumerated fixture matrices, not generators. Rows are seeded through
`board_tracker`, so teardown removes only the rows each test created. Names use ASCII letters
with distinct initials, or are identical on purpose, so the database collation and the Python
sort agree on order.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from urllib.parse import quote

import pytest
from sqlalchemy import event, select, update

from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.board_member import BoardMember
from app.models.card import Card
from tests.auth_helpers import bearer

ENDPOINTS = ("E07", "E08", "E09", "E10", "E11", "E12")
BOARD_TABLES = (
    "revotask.boards",
    "revotask.board_members",
    "revotask.board_columns",
    "revotask.cards",
)
INVALID_BOARD_IDS = (
    pytest.param("not-a-uuid", id="word"),
    pytest.param("12345", id="digits"),
    pytest.param("00000000-0000-0000-0000-00000000000", id="last-group-short"),
    pytest.param("00000000-0000-0000-0000-00000000000g", id="non-hex-character"),
    pytest.param("00000000-0000-0000-0000-0000000000000", id="last-group-long"),
    pytest.param(" 00000000-0000-0000-0000-000000000000", id="leading-space"),
    pytest.param("null", id="null-literal"),
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


# Shared helpers


def _token(board_tracker, user_id: uuid.UUID) -> dict[str, str]:
    return bearer(board_tracker.token_for(user_id))


def _route(
    endpoint: str, board_segment: str, target_segment: str, email: str
) -> tuple[str, str, dict]:
    """Return the method, path and keyword arguments for one endpoint with a valid body."""
    base = f"/api/boards/{quote(board_segment, safe='')}"
    members = f"{base}/members"
    routes = {
        "E07": ("GET", base, {}),
        "E08": ("PATCH", base, {"json": {"name": "Renamed board"}}),
        "E09": ("DELETE", base, {}),
        "E10": ("GET", members, {}),
        "E11": ("POST", members, {"json": {"email": email}}),
        "E12": ("DELETE", f"{members}/{quote(target_segment, safe='')}", {}),
    }
    return routes[endpoint]


def _send(client, endpoint: str, board_segment: str, target_segment: str, email: str, headers):
    method, path, kwargs = _route(endpoint, board_segment, target_segment, email)
    return client.open(path, method=method, headers=headers, **kwargs)


def _envelope(response) -> tuple[int, dict]:
    """Return the status and the error envelope without the per-request ID."""
    error = response.get_json()["error"]
    return response.status_code, {key: value for key, value in error.items() if key != "request_id"}


def _soft_delete(app, model, row_id: uuid.UUID) -> None:
    """Set `deleted_at` on one row. Used to build hidden states the API cannot create."""
    with app.app_context():
        try:
            db.session.execute(update(model).where(model.id == row_id).values(deleted_at=utcnow()))
            db.session.commit()
        finally:
            db.session.remove()


def _board_snapshot(app, board_id: uuid.UUID) -> dict:
    """Read the board, its memberships and its card assignments. Empty when the board is absent."""
    with app.app_context():
        try:
            board = db.session.get(Board, board_id)
            if board is None:
                return {}
            members = db.session.scalars(
                select(BoardMember).where(BoardMember.board_id == board_id)
            ).all()
            cards = db.session.scalars(
                select(Card)
                .join(BoardColumn, BoardColumn.id == Card.column_id)
                .where(BoardColumn.board_id == board_id)
            ).all()
            return {
                "name": board.name,
                "active": board.deleted_at is None,
                "memberships": sorted(
                    (str(row.user_id), row.role, row.deleted_at is None) for row in members
                ),
                "cards": sorted(
                    (
                        str(card.id),
                        str(card.assignee_id) if card.assignee_id else None,
                        card.deleted_at is None,
                    )
                    for card in cards
                ),
            }
        finally:
            db.session.remove()


@contextmanager
def _recorded_sql(app) -> Iterator[list[str]]:
    """Collect the SQL text of every statement executed inside the block."""
    statements: list[str] = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        statements.append(f"{statement} {parameters!r}")

    with app.app_context():
        engine = db.engine
    event.listen(engine, "before_cursor_execute", _record)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", _record)


def _live_board(board_tracker, target) -> tuple[uuid.UUID, object]:
    """Create an active board with one admin, `target` as a member and one assigned card."""
    admin = board_tracker.make_user(name="Board Admin")
    board_id = board_tracker.make_board(admin.id, name="Live board")
    board_tracker.make_membership(board_id, admin.id, "admin")
    board_tracker.make_membership(board_id, target.id, "member")
    column_id = board_tracker.make_column(board_id, "Todo", order=1.0)
    board_tracker.make_card(column_id, "Assigned card", assignee_id=target.id, order=1.0)
    return board_id, admin


# Property 4: Board listing visibility and order

LISTING_CELLS = (
    # (label, caller role, caller removed, board soft-deleted)
    ("admin-active", "admin", False, False),
    ("member-active", "member", False, False),
    ("admin-deleted", "admin", False, True),
    ("member-deleted", "member", False, True),
    ("removed-active", "member", True, False),
    ("removed-deleted", "member", True, True),
    ("nonmember-active", None, False, False),
    ("nonmember-deleted", None, False, True),
)
NAME_LAYOUTS = {
    "distinct-names": ("Mango", "Apple", "Kiwi", "Banana", "Cherry", "Date", "Fig", "Grape"),
    "duplicate-names": ("Shared",) * 8,
    "mixed-names": ("Zeta", "Zeta", "Alpha", "Alpha", "Mid", "Mid", "Mid", "Yak"),
}


def _seed_listing(board_tracker, app, names):
    creator = board_tracker.make_user(name="Creator")
    caller = board_tracker.make_user(name="Caller")
    bystander = board_tracker.make_user(name="Bystander")
    assert len(names) == len(LISTING_CELLS)
    boards = []
    for (label, role, removed, deleted), name in zip(LISTING_CELLS, names, strict=True):
        board_id = board_tracker.make_board(creator.id, name=name)
        if role is not None:
            row_id = board_tracker.make_membership(board_id, caller.id, role)
            if removed:
                _soft_delete(app, BoardMember, row_id)
        board_tracker.make_membership(board_id, bystander.id, "member")
        if deleted:
            _soft_delete(app, Board, board_id)
        boards.append((label, name, board_id, role, removed, deleted))
    return caller, bystander, boards


def _expected_listing(boards, *, as_caller: bool) -> list[tuple[str, str, str]]:
    """Visible boards as (id, name, role), sorted by name and then by ID."""
    rows = []
    for _label, name, board_id, role, removed, deleted in boards:
        if deleted:
            continue
        if as_caller:
            if role is None or removed:
                continue
            visible_role = role
        else:
            visible_role = "member"
        rows.append((name, board_id, visible_role))
    rows.sort(key=lambda row: (row[0], row[1]))
    return [(str(board_id), name, role) for name, board_id, role in rows]


@pytest.mark.parametrize("viewer", ["caller", "bystander"])
@pytest.mark.parametrize("layout", list(NAME_LAYOUTS))
def test_listing_shows_active_memberships_in_name_then_id_order(
    client, board_tracker, app, layout, viewer
):
    """Feature: boards-membership, Property 4: Board listing visibility and order."""
    caller, bystander, boards = _seed_listing(board_tracker, app, NAME_LAYOUTS[layout])
    user = caller if viewer == "caller" else bystander

    response = client.get("/api/boards", headers=_token(board_tracker, user.id))

    assert response.status_code == 200
    actual = [(item["id"], item["name"], item["role"]) for item in response.get_json()["data"]]
    assert actual == _expected_listing(boards, as_caller=viewer == "caller")


# Property 5: Board detail filtering and order

ORDER_LAYOUTS = {
    "distinct-orders": {"columns": (3.0, 1.0, 2.0, 4.0), "cards": (2.0, 1.0, 4.0, 3.0)},
    "tied-orders": {"columns": (2.0, 2.0, 1.0, 2.0), "cards": (1.0, 1.0, 2.0, 1.0)},
    "fractional-orders": {
        "columns": (0.5, 0.25, 1.0, 0.5),
        "cards": (0.75, 0.5, 0.5, 0.25),
    },
}
HIDDEN_CARD_INDEX = 3


def _seed_detail(board_tracker, app, role: str, layout_name: str):
    """Seed a board with active and hidden columns and cards, and return the expected view."""
    layout = ORDER_LAYOUTS[layout_name]
    creator = board_tracker.make_user(name="Creator")
    caller = board_tracker.make_user(name="Viewer")
    ada = board_tracker.make_user(name="Ada Lovelace")
    bo = board_tracker.make_user(name="Bo Chen")
    board_id = board_tracker.make_board(creator.id, name="Detail board")
    board_tracker.make_membership(board_id, caller.id, role)
    board_tracker.make_membership(board_id, ada.id, "member")
    board_tracker.make_membership(board_id, bo.id, "member")

    # Assignee for each card position. The hidden card position is also assigned.
    assignees = (ada.id, bo.id, None, ada.id)
    names = {ada.id: "Ada Lovelace", bo.id: "Bo Chen"}
    active_columns = []
    hidden_ids = []
    for index, column_order in enumerate(layout["columns"]):
        column_id = board_tracker.make_column(board_id, f"Column {index}", order=column_order)
        cards = []
        for card_index, card_order in enumerate(layout["cards"]):
            assignee = assignees[card_index]
            card_id = board_tracker.make_card(
                column_id,
                f"Card {index}-{card_index}",
                assignee_id=assignee,
                order=card_order,
            )
            if card_index == HIDDEN_CARD_INDEX:
                _soft_delete(app, Card, card_id)
                hidden_ids.append(card_id)
            else:
                cards.append((card_id, card_order, assignee))
        active_columns.append((column_id, column_order, cards))

    # A hidden column with an active card under it. Neither may appear in E07.
    hidden_column = board_tracker.make_column(board_id, "Hidden column", order=0.1)
    hidden_card = board_tracker.make_card(hidden_column, "Under hidden column", order=1.0)
    _soft_delete(app, BoardColumn, hidden_column)
    hidden_ids.extend([hidden_column, hidden_card])

    expected_columns = [
        (
            str(column_id),
            [str(card_id) for card_id, _order, _assignee in sorted(cards, key=_order_key)],
        )
        for column_id, _order, cards in sorted(active_columns, key=_order_key)
    ]
    expected_assignees = {
        str(card_id): (str(assignee) if assignee else None, names.get(assignee))
        for _column_id, _order, cards in active_columns
        for card_id, _card_order, assignee in cards
    }
    return caller, board_id, expected_columns, expected_assignees, hidden_ids


def _order_key(item):
    """Sort a (id, order, ...) tuple by stored order and then ID, as the spec requires."""
    return item[1], item[0]


@pytest.mark.parametrize("layout", list(ORDER_LAYOUTS))
@pytest.mark.parametrize("role", ["admin", "member"])
def test_detail_shows_active_rows_in_order_then_id(client, board_tracker, app, role, layout):
    """Feature: boards-membership, Property 5: Board detail filtering and order."""
    caller, board_id, expected_columns, expected_assignees, hidden_ids = _seed_detail(
        board_tracker, app, role, layout
    )

    response = client.get(f"/api/boards/{board_id}", headers=_token(board_tracker, caller.id))

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["role"] == role
    actual_columns = [
        (column["id"], [card["id"] for card in column["cards"]]) for column in data["columns"]
    ]
    assert actual_columns == expected_columns
    for column in data["columns"]:
        for card in column["cards"]:
            assert (card["assignee_id"], card["assignee_name"]) == expected_assignees[card["id"]]
    body = response.get_data(as_text=True)
    for hidden_id in hidden_ids:
        assert str(hidden_id) not in body


# Property 6: Inaccessible boards are indistinguishable


@dataclass(frozen=True)
class Source:
    """One reason a board is inaccessible: the board in the URL, the caller and the target."""

    label: str
    board_id: uuid.UUID
    caller_id: uuid.UUID


def _inaccessible_sources(board_tracker, app, target) -> list[Source]:
    """Build the four sources: nonexistent, soft-deleted, nonmember and removed member."""
    outsider = board_tracker.make_user(name="Outsider")
    nonexistent_id = uuid.uuid4()

    deleted_board, deleted_admin = _live_board(board_tracker, target)
    _soft_delete(app, Board, deleted_board)

    nonmember_board, _admin = _live_board(board_tracker, target)

    removed_board, _admin = _live_board(board_tracker, target)
    removed_user = board_tracker.make_user(name="Removed user")
    removed_row = board_tracker.make_membership(removed_board, removed_user.id, "member")
    _soft_delete(app, BoardMember, removed_row)

    return [
        Source("nonexistent board", nonexistent_id, outsider.id),
        Source("soft-deleted board", deleted_board, deleted_admin.id),
        Source("nonmember", nonmember_board, outsider.id),
        Source("removed member", removed_board, removed_user.id),
    ]


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_inaccessible_boards_share_one_404_envelope_and_change_nothing(
    client, board_tracker, app, endpoint
):
    """Feature: boards-membership, Property 6: Inaccessible boards are indistinguishable."""
    target = board_tracker.make_user(name="Target")
    sources = _inaccessible_sources(board_tracker, app, target)

    envelopes = {}
    for source in sources:
        before = _board_snapshot(app, source.board_id)
        response = _send(
            client,
            endpoint,
            str(source.board_id),
            str(target.id),
            target.email,
            _token(board_tracker, source.caller_id),
        )
        envelopes[source.label] = _envelope(response)
        assert _board_snapshot(app, source.board_id) == before, source.label

    first = envelopes["nonexistent board"]
    assert envelopes == dict.fromkeys(envelopes, first)
    status, error = first
    assert status == 404
    assert error["code"] == "NOT_FOUND"
    assert "fields" not in error


def test_e12_target_from_another_board_gets_the_missing_user_404(client, board_tracker, app):
    """Feature: boards-membership, Property 6: Inaccessible boards are indistinguishable.

    A `user_id` that belongs to a member of another board returns the same 404 as an unknown
    user ID and changes nothing. The caller is an admin of the URL board, so the 404 comes from
    the target lookup, not from authorization.
    """
    other_target = board_tracker.make_user(name="Other board member")
    other_board, _other_admin = _live_board(board_tracker, other_target)
    board_id, admin = _live_board(board_tracker, board_tracker.make_user(name="Local member"))
    headers = _token(board_tracker, admin.id)
    before_board = _board_snapshot(app, board_id)
    before_other = _board_snapshot(app, other_board)

    other_response = _send(
        client, "E12", str(board_id), str(other_target.id), other_target.email, headers
    )
    unknown_response = _send(
        client, "E12", str(board_id), str(uuid.uuid4()), other_target.email, headers
    )

    assert _envelope(other_response) == _envelope(unknown_response)
    assert _envelope(other_response)[0] == 404
    assert _envelope(other_response)[1]["code"] == "NOT_FOUND"
    assert _board_snapshot(app, board_id) == before_board
    assert _board_snapshot(app, other_board) == before_other


# Property 7: Non-UUID identifiers are rejected before lookup


def _caller_and_board(board_tracker):
    target = board_tracker.make_user(name="Target")
    board_id, admin = _live_board(board_tracker, target)
    return admin, target, board_id


def _assert_no_board_lookup(statements: list[str]) -> None:
    for statement in statements:
        for table in BOARD_TABLES:
            assert table not in statement, statement


@pytest.mark.parametrize("invalid", INVALID_BOARD_IDS)
@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_non_uuid_board_segment_returns_400_before_any_board_lookup(
    client, board_tracker, app, endpoint, invalid
):
    """Feature: boards-membership, Property 7: Non-UUID identifiers are rejected before lookup."""
    admin, target, _board_id = _caller_and_board(board_tracker)
    headers = _token(board_tracker, admin.id)

    with _recorded_sql(app) as statements:
        response = _send(client, endpoint, invalid, str(target.id), target.email, headers)

    assert _envelope(response) == (
        400,
        {"code": "VALIDATION_ERROR", "message": "Check the submitted fields."},
    )
    _assert_no_board_lookup(statements)


@pytest.mark.parametrize("invalid", INVALID_BOARD_IDS)
def test_non_uuid_user_segment_on_e12_returns_400_before_any_board_lookup(
    client, board_tracker, app, invalid
):
    """Feature: boards-membership, Property 7: Non-UUID identifiers are rejected before lookup."""
    admin, target, board_id = _caller_and_board(board_tracker)
    headers = _token(board_tracker, admin.id)

    with _recorded_sql(app) as statements:
        response = _send(client, "E12", str(board_id), invalid, target.email, headers)

    assert _envelope(response) == (
        400,
        {"code": "VALIDATION_ERROR", "message": "Check the submitted fields."},
    )
    _assert_no_board_lookup(statements)


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_valid_missing_uuid_reaches_the_board_table(client, board_tracker, app, endpoint):
    """Feature: boards-membership, Property 7: Non-UUID identifiers are rejected before lookup.

    Control case for the SQL capture used above. A well-formed but unknown board ID must reach
    the boards table, so an empty capture in the rejection tests would mean something.
    """
    admin, target, _board_id = _caller_and_board(board_tracker)
    headers = _token(board_tracker, admin.id)

    with _recorded_sql(app) as statements:
        response = _send(client, endpoint, str(uuid.uuid4()), str(target.id), target.email, headers)

    assert response.status_code == 404
    assert any("revotask.boards" in statement for statement in statements)
