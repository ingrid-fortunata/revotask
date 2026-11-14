"""Authentication, privacy and logging of E27 and E28 (T13; Requirement 5; Property 4)."""

from __future__ import annotations

import logging
from datetime import timedelta

import pytest

from tests.auth_helpers import bearer, decode_unverified
from tests.kanban_helpers import make_kanban
from tests.notification_helpers import (
    assign,
    comment,
    insert_notification,
    list_as,
    mark_as,
    rows,
    seed_world,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return seed_world(make_kanban(board_tracker, app))


@pytest.fixture
def note(world, app):
    return insert_notification(
        app, world.ana.id, world.kanban.admin.id, world.kanban.board_id, world.card
    )


def _private(response):
    assert response.headers["Cache-Control"] == "private, no-store"


def _headers(kind: str, world, tracker) -> dict[str, str]:
    if kind == "none":
        return {}
    if kind == "malformed":
        return bearer("junk")
    if kind == "expired":
        return bearer(tracker.token_for(world.ana.id, expires_delta=timedelta(seconds=-5)))
    token = tracker.token_for(world.ana.id)
    tracker.revoke(decode_unverified(token)["jti"])
    return bearer(token)


@pytest.mark.parametrize("kind", ["none", "malformed", "expired", "revoked"])
def test_both_routes_return_401_and_change_nothing(client, world, note, board_tracker, app, kind):
    headers = _headers(kind, world, board_tracker)
    listed = client.get("/api/notifications", headers=headers)
    marked = client.patch(f"/api/notifications/{note}/read", headers=headers)
    for response in (listed, marked):
        assert response.status_code == 401
        assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"
        _private(response)
    assert rows(app, world.ana.id)[0]["read_at"] is None


def test_every_response_is_private_no_store(client, world, note):
    kanban = world.kanban
    responses = [
        list_as(client, kanban, world.ana),  # 200
        list_as(client, kanban, world.ana, "?page=0"),  # 400
        mark_as(client, kanban, world.ana, note),  # 200
        mark_as(client, kanban, world.ben, note),  # 404
        client.patch("/api/notifications/nope/read", headers=kanban.headers(world.ana)),  # 400
        client.get("/api/notifications"),  # 401
    ]
    assert [r.status_code for r in responses] == [200, 400, 200, 404, 400, 401]
    for response in responses:
        _private(response)


def test_a_user_never_reads_or_marks_another_users_row(client, world, note, app):
    kanban = world.kanban
    for stranger in (world.ben, kanban.admin):
        assert list_as(client, kanban, stranger).get_json()["data"]["items"] == []
        assert mark_as(client, kanban, stranger, note).status_code == 404
    assert rows(app, world.ana.id)[0]["read_at"] is None


def test_no_actor_name_card_title_or_content_is_logged(app, schema_at_head, board_tracker, caplog):
    kanban = make_kanban(board_tracker, app)
    kanban_world = seed_world(kanban)
    secret_actor = "Zelda Quokkaname"
    secret_title = "Secret Title Alpha"
    secret_text = "secret comment text omega"
    from sqlalchemy import update

    from app.extensions import db
    from app.models.card import Card
    from app.models.user import User
    from tests.kanban_helpers import _write

    _write(
        app,
        lambda: db.session.execute(
            update(User).where(User.id == kanban.admin.id).values(name=secret_actor)
        ),
    )
    _write(
        app,
        lambda: db.session.execute(
            update(Card).where(Card.id == kanban_world.card).values(title=secret_title)
        ),
    )
    client = app.test_client()
    with caplog.at_level(logging.DEBUG, logger="revotask"):
        assert assign(client, kanban, kanban_world.card, kanban_world.ana.id).status_code == 200
        assert (
            comment(
                client, kanban, kanban_world.card, by=kanban_world.ben, content=secret_text
            ).status_code
            == 201
        )
        data = list_as(client, kanban, kanban_world.ana).get_json()["data"]
        assert mark_as(client, kanban, kanban_world.ana, data["items"][0]["id"]).status_code == 200
    assert caplog.records, "expected the request log lines to be captured"
    for needle in (secret_actor, secret_title, secret_text):
        assert needle not in caplog.text
