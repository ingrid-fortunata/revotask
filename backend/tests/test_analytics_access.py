"""E29 authentication, access, validation order and privacy (T14; Requirement 5; P7, P9)."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest

from app.models.board import Board
from tests.analytics_helpers import (
    ACTIVITY_KEYS,
    COLUMN_KEYS,
    DATA_KEYS,
    WEEK_START,
    freeze,
    get_analytics,
    seed_events,
)
from tests.auth_helpers import bearer, decode_unverified
from tests.kanban_helpers import (
    error_without_request_id,
    make_kanban,
    soft_delete,
    soft_delete_membership,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def _private(response):
    assert response.headers["Cache-Control"] == "private, no-store"


def _headers(kind: str, kanban, tracker) -> dict[str, str]:
    if kind == "none":
        return {}
    if kind == "malformed":
        return bearer("junk")
    if kind == "expired":
        return bearer(tracker.token_for(kanban.admin.id, expires_delta=timedelta(seconds=-5)))
    token = tracker.token_for(kanban.admin.id)
    tracker.revoke(decode_unverified(token)["jti"])
    return bearer(token)


def test_an_admin_and_a_member_can_read(client, kanban):
    member = kanban.add_member("member", name="Mia")
    assert get_analytics(client, kanban).status_code == 200
    assert get_analytics(client, kanban, user=member).status_code == 200


@pytest.mark.parametrize("kind", ["none", "malformed", "expired", "revoked"])
def test_a_bad_token_is_401(client, kanban, board_tracker, kind):
    response = client.get(
        f"/api/boards/{kanban.board_id}/analytics", headers=_headers(kind, kanban, board_tracker)
    )
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"
    _private(response)


def _inaccessible(kind: str, kanban, app, tracker):
    """Return `(user, board_id)` for each way a board can be out of reach."""
    if kind == "nonmember":
        return tracker.make_user(name="Stranger"), kanban.board_id
    if kind == "removed":
        member = kanban.add_member("member", name="Gone")
        soft_delete_membership(app, kanban.board_id, member.id)
        return member, kanban.board_id
    if kind == "missing":
        return kanban.admin, uuid.uuid4()
    soft_delete(app, Board, kanban.board_id)
    return kanban.admin, kanban.board_id


def test_every_inaccessible_board_gives_one_identical_404(client, kanban, app, board_tracker):
    envelopes = []
    for kind in ["nonmember", "removed", "missing", "deleted"]:
        # "deleted" runs last because it soft-deletes the shared board.
        user, board_id = _inaccessible(kind, kanban, app, board_tracker)
        response = get_analytics(client, kanban, user=user, board_id=board_id)
        assert response.status_code == 404, kind
        assert response.get_json()["error"]["code"] == "NOT_FOUND"
        _private(response)
        envelopes.append(error_without_request_id(response))
    assert all(envelope == envelopes[0] for envelope in envelopes)


def test_a_malformed_id_is_400(client, kanban):
    response = get_analytics(client, kanban, board_id="not-a-uuid")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
    _private(response)


@pytest.mark.parametrize(
    "query", ["?week=1", "?x", "?a=1&a=2", "?board_id={board}", "?page=1", "?"]
)
def test_any_query_parameter_is_400_with_the_standard_message(client, kanban, query):
    if query == "?":
        # An empty query string carries no parameter, so it is allowed.
        assert get_analytics(client, kanban, query="?").status_code == 200
        return
    response = get_analytics(client, kanban, query=query.format(board=kanban.board_id))
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["message"] == "Check the submitted fields."
    assert "fields" not in error
    _private(response)


def test_the_check_order_is_id_then_query_then_access(client, kanban, board_tracker):
    stranger = board_tracker.make_user(name="Stranger")
    # A malformed ID wins over a missing board and over a query parameter.
    assert get_analytics(client, kanban, board_id="nope", query="?x=1").status_code == 400
    # A query parameter wins over the 404 for a nonmember and for a missing board.
    assert get_analytics(client, kanban, user=stranger, query="?x=1").status_code == 400
    assert get_analytics(client, kanban, board_id=uuid.uuid4(), query="?x=1").status_code == 400
    # Without a query the same requests are 404.
    assert get_analytics(client, kanban, user=stranger).status_code == 404
    assert get_analytics(client, kanban, board_id=uuid.uuid4()).status_code == 404


def test_every_response_is_private_and_lists_only_documented_keys(
    client, kanban, app, board_tracker, monkeypatch
):
    freeze(monkeypatch)
    column = board_tracker.make_column(kanban.board_id, "Todo", order=1.0)
    card = board_tracker.make_card(column, "Secret title", order=1.0)
    seed_events(
        app,
        kanban.board_id,
        [
            ("card_created", kanban.admin.id, card, WEEK_START + timedelta(hours=1)),
            ("entered_done", kanban.admin.id, card, WEEK_START + timedelta(hours=1)),
        ],
    )
    response = get_analytics(client, kanban)
    _private(response)
    data = response.get_json()["data"]
    assert set(data) == DATA_KEYS
    assert all(set(item) == COLUMN_KEYS for item in data["cards_per_column"])
    assert data["member_activity"] and all(
        set(item) == ACTIVITY_KEYS for item in data["member_activity"]
    )
    body = response.get_data(as_text=True)
    assert "Secret title" not in body and kanban.admin.email not in body
    assert str(card) not in body  # no card ID and no event ID leave the API
