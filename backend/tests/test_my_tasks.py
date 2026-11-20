"""E21 My Tasks (task 2.2; Requirements 1.1-1.8, 3.3, 3.4; S1, S2, S5, Q5). Properties 1, 2.

Revision 2 (task 12.2; Requirements 9.1, 9.6; S12; Property 13): `column_name` and `is_done`.
"""

from __future__ import annotations

import pytest
from sqlalchemy import update

from app.extensions import db
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.card import Card
from app.models.user import User
from tests.auth_helpers import bearer
from tests.kanban_helpers import (
    _write,
    board_version,
    events,
    soft_delete,
    soft_delete_membership,
)
from tests.search_helpers import CARD_FIELDS, my_tasks_get


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


class World:
    """Caller `me` and `other`, both members of every board made through `board`."""

    def __init__(self, tracker, app):
        self.tracker = tracker
        self.app = app
        self.me = tracker.make_user(name="Me")
        self.other = tracker.make_user(name="Other")

    def board(self, name: str, *, me_role: str = "member"):
        board_id = self.tracker.make_board(self.other.id, name=name)
        self.tracker.make_membership(board_id, self.other.id, "admin")
        self.tracker.make_membership(board_id, self.me.id, me_role)
        return board_id

    def column(self, board_id, name="Todo", order=1.0, *, done=False):
        column_id = self.tracker.make_column(board_id, name=name, order=order)
        if done:
            _write(
                self.app,
                lambda: db.session.execute(
                    update(BoardColumn).where(BoardColumn.id == column_id).values(is_done=True)
                ),
            )
        return column_id

    def card(self, column_id, title, assignee=None, order=1.0):
        return self.tracker.make_card(
            column_id, title, assignee_id=(assignee or self.me).id, order=order
        )

    def headers(self, user=None):
        return bearer(self.tracker.token_for((user or self.me).id))

    def get(self, client, user=None):
        return my_tasks_get(client, self.headers(user))


@pytest.fixture
def world(board_tracker, app):
    return World(board_tracker, app)


def _ids(response):
    return [item["id"] for item in response.get_json()["data"]]


def test_returns_the_documented_fields(client, world):
    board = world.board("Alpha")
    card = world.card(world.column(board), "My card")
    response = world.get(client)
    assert response.status_code == 200
    (item,) = response.get_json()["data"]
    assert set(item) == CARD_FIELDS
    assert item["id"] == str(card)
    assert item["board_id"] == str(board)
    assert item["board_name"] == "Alpha"
    assert item["assignee_id"] == str(world.me.id)
    assert item["assignee_name"] == "Me"
    assert item["description"] is None
    assert (item["column_name"], item["is_done"]) == ("Todo", False)


def test_status_follows_the_cards_own_column(client, world):
    board = world.board("Alpha")
    todo = world.column(board, "Todo", order=1.0)
    done = world.column(board, "Finished", order=2.0, done=True)
    open_card = world.card(todo, "Open", order=1.0)
    done_card = world.card(done, "Closed", order=1.0)
    items = {item["id"]: item for item in world.get(client).get_json()["data"]}
    open_item, done_item = items[str(open_card)], items[str(done_card)]
    assert (open_item["column_name"], open_item["is_done"]) == ("Todo", False)
    assert (done_item["column_name"], done_item["is_done"]) == ("Finished", True)
    assert isinstance(done_item["is_done"], bool)


def test_status_shows_a_rename_and_a_moved_done_flag_on_the_next_read(client, world, app):
    board = world.board("Alpha")
    first = world.column(board, "Todo", order=1.0, done=True)
    second = world.column(board, "Doing", order=2.0)
    world.card(first, "In first", order=1.0)
    world.card(second, "In second", order=1.0)

    def statuses():
        data = world.get(client).get_json()["data"]
        return {i["title"]: (i["column_name"], i["is_done"]) for i in data}

    assert statuses() == {"In first": ("Todo", True), "In second": ("Doing", False)}
    _write(
        app,
        lambda: db.session.execute(
            update(BoardColumn).where(BoardColumn.id == first).values(name="Backlog")
        ),
    )
    assert statuses()["In first"] == ("Backlog", True)
    _write(
        app,
        lambda: db.session.execute(
            update(BoardColumn).where(BoardColumn.id == first).values(is_done=False)
        ),
    )
    _write(
        app,
        lambda: db.session.execute(
            update(BoardColumn).where(BoardColumn.id == second).values(is_done=True)
        ),
    )
    assert statuses() == {"In first": ("Backlog", False), "In second": ("Doing", True)}


def test_no_assignment_returns_an_empty_list(client, world):
    world.column(world.board("Alpha"))
    response = world.get(client)
    assert response.status_code == 200
    assert response.get_json() == {"data": []}


def test_a_done_card_is_included(client, world):
    column = world.column(world.board("Alpha"), "Done", done=True)
    card = world.card(column, "Finished")
    assert _ids(world.get(client)) == [str(card)]


def test_only_the_callers_cards_are_returned(client, world):
    column = world.column(world.board("Alpha"))
    mine = world.card(column, "Mine", order=1.0)
    theirs = world.card(column, "Theirs", assignee=world.other, order=2.0)
    world.tracker.make_card(column, "Unassigned", order=3.0)
    assert _ids(world.get(client)) == [str(mine)]
    assert _ids(world.get(client, world.other)) == [str(theirs)]


def _excluded_soft_deleted_card(world, app):
    column = world.column(world.board("Alpha"))
    card = world.card(column, "Deleted")
    soft_delete(app, Card, card)


def _excluded_soft_deleted_column(world, app):
    column = world.column(world.board("Alpha"))
    world.card(column, "In deleted column")
    soft_delete(app, BoardColumn, column)


def _excluded_soft_deleted_board(world, app):
    board = world.board("Alpha")
    world.card(world.column(board), "On deleted board")
    soft_delete(app, Board, board)


def _excluded_removed_member(world, app):
    board = world.board("Alpha")
    world.card(world.column(board), "Still names me")
    soft_delete_membership(app, board, world.me.id)


def _excluded_never_a_member(world, app):
    board_id = world.tracker.make_board(world.other.id, name="Not mine")
    world.tracker.make_membership(board_id, world.other.id, "admin")
    world.card(world.column(board_id), "Assigned but no membership")


@pytest.mark.parametrize(
    "arrange",
    [
        _excluded_soft_deleted_card,
        _excluded_soft_deleted_column,
        _excluded_soft_deleted_board,
        _excluded_removed_member,
        _excluded_never_a_member,
    ],
    ids=lambda fn: fn.__name__.removeprefix("_excluded_"),
)
def test_property_1_each_exclusion(client, world, app, arrange):
    kept_board = world.board("Kept")
    kept = world.card(world.column(kept_board), "Kept card")
    arrange(world, app)
    assert _ids(world.get(client)) == [str(kept)]


def test_property_2_sort_order_and_adjacency(client, world):
    # Names that differ by case and equal names: lower-case name, then board ID.
    boards = {
        "b": world.board("beta"),
        "A1": world.board("Alpha"),
        "a2": world.board("alpha"),
        "B2": world.board("Beta"),
    }
    expected = []
    for key, board in boards.items():
        late = world.column(board, "Late", order=2.0)
        early = world.column(board, "Early", order=1.0)
        # Two cards tie on order, so the card ID breaks the tie last.
        tie = [world.card(early, f"{key} tie {n}", order=5.0) for n in range(2)]
        first = world.card(early, f"{key} first", order=1.0)
        last = world.card(late, f"{key} last", order=0.5)
        expected.append((board, [first, *sorted(tie, key=lambda v: v.bytes), last]))
    names = {
        boards["b"]: "beta",
        boards["A1"]: "Alpha",
        boards["a2"]: "alpha",
        boards["B2"]: "Beta",
    }
    expected.sort(key=lambda pair: (names[pair[0]].lower(), pair[0].bytes))
    want = [str(card) for _board, cards in expected for card in cards]
    response = world.get(client)
    assert _ids(response) == want
    # Every board's cards are adjacent.
    seen, previous = [], None
    for item in response.get_json()["data"]:
        if item["board_id"] != previous:
            assert item["board_id"] not in seen
            seen.append(item["board_id"])
            previous = item["board_id"]


def test_the_order_is_the_same_on_every_call(client, world):
    for name in ("Zed", "alpha", "Mid"):
        world.card(world.column(world.board(name)), f"{name} card")
    first = _ids(world.get(client))
    assert all(_ids(world.get(client)) == first for _ in range(3))


def test_a_member_removal_hides_the_boards_cards_at_once(client, world, app):
    board = world.board("Alpha")
    world.card(world.column(board), "Mine")
    assert len(_ids(world.get(client))) == 1
    soft_delete_membership(app, board, world.me.id)
    assert _ids(world.get(client)) == []


def test_names_follow_a_rename(client, world, app):
    board = world.board("Old name")
    world.card(world.column(board), "Mine")
    _write(
        app,
        lambda: db.session.execute(update(Board).where(Board.id == board).values(name="New name")),
    )
    _write(
        app,
        lambda: db.session.execute(
            update(User).where(User.id == world.me.id).values(name="Renamed")
        ),
    )
    (item,) = world.get(client).get_json()["data"]
    assert (item["board_name"], item["assignee_name"]) == ("New name", "Renamed")


def test_the_read_writes_nothing(client, world, app):
    board = world.board("Alpha")
    card = world.card(world.column(board), "Mine")
    before = (events(app, board), board_version(app, board))
    for _ in range(2):
        assert world.get(client).status_code == 200
    assert (events(app, board), board_version(app, board)) == before
    assert _ids(world.get(client)) == [str(card)]


def test_responses_are_private_no_store(client, world):
    ok = world.get(client)
    bad = my_tasks_get(client, world.headers(), "assignee=you")
    unauth = client.get("/api/cards?assignee=me")
    for response in (ok, bad, unauth):
        assert response.headers["Cache-Control"] == "private, no-store"


def test_requires_authentication(client):
    assert client.get("/api/cards?assignee=me").status_code == 401


def test_other_methods_are_not_allowed(client, world):
    response = client.post("/api/cards", headers=world.headers(), json={})
    assert response.status_code == 405
