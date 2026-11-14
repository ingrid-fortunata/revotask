"""E22 card search (task 2.3; Requirements 2.1-2.7, 3.1-3.4; S3-S5, S11). Properties 3, 4."""

from __future__ import annotations

import pytest
from sqlalchemy import update

from app.extensions import db
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.card import Card
from app.models.card_comment import CardComment
from tests.auth_helpers import bearer
from tests.kanban_helpers import (
    _write,
    board_version,
    error_without_request_id,
    events,
    soft_delete,
    soft_delete_membership,
)
from tests.search_helpers import SEARCH_FIELDS, search_get, titles


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


class Board_:
    """A board with an admin and a member and a helper for columns and cards."""

    def __init__(self, tracker, app, name="Search board"):
        self.tracker = tracker
        self.app = app
        self.admin = tracker.make_user(name="Admin")
        self.member = tracker.make_user(name="Member")
        self.id = tracker.make_board(self.admin.id, name=name)
        tracker.make_membership(self.id, self.admin.id, "admin")
        tracker.make_membership(self.id, self.member.id, "member")
        self.column = tracker.make_column(self.id, "Todo", order=1.0)

    def headers(self, user=None):
        return bearer(self.tracker.token_for((user or self.member).id))

    def card(self, title, column=None, order=1.0, **kwargs):
        return self.tracker.make_card(column or self.column, title, order=order, **kwargs)

    def search(self, client, q, user=None):
        return search_get(client, self.headers(user), self.id, q)


@pytest.fixture
def board(board_tracker, app):
    return Board_(board_tracker, app)


def test_returns_the_documented_fields_only(client, board):
    card = board.card("Write the report")
    response = board.search(client, "report")
    assert response.status_code == 200
    (item,) = response.get_json()["data"]
    assert set(item) == SEARCH_FIELDS
    assert item == {"id": str(card), "title": "Write the report", "column_id": str(board.column)}


def test_no_match_returns_an_empty_list(client, board):
    board.card("Something")
    response = board.search(client, "nothing like it")
    assert response.status_code == 200
    assert response.get_json() == {"data": []}


@pytest.mark.parametrize("q", ["report", "REPORT", "RePoRt", "ort", "Write the"])
def test_matching_is_a_case_insensitive_substring(client, board, q):
    board.card("Write the Report")
    assert titles(board.search(client, q)) == ["Write the Report"]


def test_the_query_is_trimmed(client, board):
    board.card("Alpha")
    assert titles(board.search(client, "  alpha \t")) == ["Alpha"]


@pytest.mark.parametrize(
    ("q", "matching", "others"),
    [
        ("50%", ["Reach 50% of goal"], ["Reach 50 of goal", "Reach 500 of goal"]),
        ("%", ["Reach 50% of goal"], ["Plain title"]),
        ("_", ["snake_case"], ["snakecase", "Plain title"]),
        ("a_c", ["a_c"], ["abc", "a-c"]),
        ("\\", ["back\\slash"], ["backslash", "Plain title"]),
        ("/", ["a/b"], ["ab", "Plain title"]),
        ("%_", ["x%_y"], ["x%y", "x_y"]),
    ],
)
def test_property_4_wildcards_are_literal(client, board, q, matching, others):
    for title in [*matching, *others]:
        board.card(title)
    assert sorted(titles(board.search(client, q))) == sorted(matching)


def test_title_only_not_description_or_comments(client, board, app):
    card = board.card("Plain title")
    _write(
        app,
        lambda: db.session.execute(
            update(Card).where(Card.id == card).values(description="needle in description")
        ),
    )
    _write(
        app,
        lambda: db.session.add(
            CardComment(card_id=card, author_id=board.member.id, content="needle in comment")
        ),
    )
    assert board.search(client, "needle").get_json() == {"data": []}


def test_property_3_the_cap_is_20_in_board_order_with_id_tiebreak(client, board):
    second = board.tracker.make_column(board.id, "Second", order=2.0)
    ids = [board.card(f"match {n}", column=second, order=1.0) for n in range(11)]
    ids += [board.card(f"match {n}", column=board.column, order=1.0) for n in range(11, 22)]
    # 22 matching cards; the first column holds 11, the second 11. Board order: Todo then Second.
    response = board.search(client, "match")
    got = [item["id"] for item in response.get_json()["data"]]
    first_col = sorted(ids[11:], key=lambda v: v.bytes)
    second_col = sorted(ids[:11], key=lambda v: v.bytes)
    assert len(got) == 20
    assert got == [str(i) for i in (first_col + second_col)[:20]]


def test_exactly_21_matches_return_20_and_the_21st_is_last_in_order(client, board):
    cards = [board.card(f"hit {n:02d}", order=float(n + 1)) for n in range(21)]
    got = [item["id"] for item in board.search(client, "hit").get_json()["data"]]
    assert got == [str(c) for c in cards[:20]]


def test_order_follows_column_then_card_order(client, board):
    second = board.tracker.make_column(board.id, "Second", order=2.0)
    c = board.card("m c", column=second, order=1.0)
    b = board.card("m b", order=2.0)
    a = board.card("m a", order=1.0)
    assert [i["id"] for i in board.search(client, "m ").get_json()["data"]] == [
        str(a),
        str(b),
        str(c),
    ]
    # Reorder the columns: Second now comes first.
    _write(
        board.app,
        lambda: db.session.execute(
            update(BoardColumn).where(BoardColumn.id == second).values(order=0.5)
        ),
    )
    assert [i["id"] for i in board.search(client, "m ").get_json()["data"]] == [
        str(c),
        str(a),
        str(b),
    ]


def test_soft_deleted_card_and_column_are_excluded(client, board, app):
    gone = board.card("hit gone")
    kept = board.card("hit kept")
    column = board.tracker.make_column(board.id, "Gone column", order=3.0)
    board.card("hit in gone column", column=column)
    soft_delete(app, Card, gone)
    soft_delete(app, BoardColumn, column)
    assert [i["id"] for i in board.search(client, "hit").get_json()["data"]] == [str(kept)]


def test_another_boards_cards_are_never_returned(client, board):
    other = Board_(board.tracker, board.app, name="Other board")
    other.card("hit elsewhere")
    mine = board.card("hit here")
    assert [i["id"] for i in board.search(client, "hit").get_json()["data"]] == [str(mine)]
    # Member of the first board only: the other board's ID is a 404, not an empty list.
    assert board.search(client, "hit", user=board.member).status_code == 200
    assert search_get(client, board.headers(), other.id, "hit").status_code == 404


def test_admin_and_member_may_search(client, board):
    board.card("hit")
    assert board.search(client, "hit", user=board.admin).status_code == 200
    assert board.search(client, "hit", user=board.member).status_code == 200


def test_property_5_one_404_envelope_for_every_unreachable_board(client, board, app):
    outsider = board.tracker.make_user(name="Outsider")
    removed = board.tracker.make_user(name="Removed")
    board.tracker.make_membership(board.id, removed.id, "member")
    soft_delete_membership(app, board.id, removed.id)
    deleted = Board_(board.tracker, app, name="Deleted board")
    soft_delete(app, Board, deleted.id)
    import uuid

    responses = [
        search_get(client, bearer(board.tracker.token_for(outsider.id)), board.id, "x"),
        search_get(client, bearer(board.tracker.token_for(removed.id)), board.id, "x"),
        search_get(client, board.headers(), uuid.uuid4(), "x"),
        search_get(client, deleted.headers(), deleted.id, "x"),
    ]
    assert {r.status_code for r in responses} == {404}
    assert len({str(error_without_request_id(r)) for r in responses}) == 1


def test_the_read_writes_nothing(client, board, app):
    board.card("hit")
    before = (events(app, board.id), board_version(app, board.id))
    assert board.search(client, "hit").status_code == 200
    assert board.search(client, "nothing").status_code == 200
    assert (events(app, board.id), board_version(app, board.id)) == before


def test_responses_are_private_no_store(client, board):
    for response in (
        board.search(client, "x"),
        board.search(client, ""),
        client.get(f"/api/boards/{board.id}/cards/search?q=x"),
    ):
        assert response.headers["Cache-Control"] == "private, no-store"


def test_requires_authentication(client, board):
    assert client.get(f"/api/boards/{board.id}/cards/search?q=x").status_code == 401


def test_a_post_is_not_allowed(client, board):
    response = client.post(f"/api/boards/{board.id}/cards/search", headers=board.headers(), json={})
    assert response.status_code == 405
