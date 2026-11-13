"""E17, E18 and E19 (task 5.7; Requirements 3.1-3.12, 5.1).

Rows are created through `board_tracker`, so teardown removes only what each test made.
"""

from __future__ import annotations

import uuid

import pytest

from tests.kanban_helpers import (
    board_version,
    card_rows,
    card_snapshot,
    card_titles,
    e07_columns,
    events,
    make_kanban,
    post_card,
    seed_cards,
    soft_delete,
    soft_delete_membership,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def kanban(board_tracker, app):
    return make_kanban(board_tracker, app)


def _kinds(app, board_id):
    return [kind for kind, _actor, _card in events(app, board_id)]


def test_e17_appends_a_card_bumps_the_version_and_records_card_created(client, kanban, app):
    t = seed_cards(kanban)
    response = post_card(client, kanban, t.doing, title="  Write docs  ", description="Details")
    assert response.status_code == 201
    kanban.tracker.record_card_from_response(response)
    data = response.get_json()["data"]
    assert set(data) == {"card", "position_version"}
    assert set(data["card"]) == {
        "id",
        "column_id",
        "title",
        "description",
        "assignee_id",
        "assignee_name",
        "order",
    }
    assert data["card"]["title"] == "Write docs"
    assert data["card"]["order"] == 2048.0  # after Y1 at 1024
    assert data["card"]["assignee_name"] is None
    assert data["position_version"] == 1
    assert card_titles(app, t.doing) == ["Y1", "Write docs"]
    assert events(app, kanban.board_id) == [
        ("card_created", kanban.admin.id, uuid.UUID(data["card"]["id"]))
    ]


def test_e17_into_an_empty_column_starts_at_1024(client, kanban, app):
    seed_cards(kanban)
    empty = kanban.tracker.make_column(kanban.board_id, "Empty", order=3072.0)
    response = post_card(client, kanban, empty, title="First")
    assert response.get_json()["data"]["card"]["order"] == 1024.0
    kanban.tracker.record_card_from_response(response)


def test_e17_in_a_done_column_also_records_entered_done(client, kanban, app):
    t = seed_cards(kanban, doing_is_done=True)
    response = post_card(client, kanban, t.doing, title="Shipped")
    card_id = uuid.UUID(response.get_json()["data"]["card"]["id"])
    kanban.tracker.record_card_from_response(response)
    assert sorted(events(app, kanban.board_id), key=lambda e: e[0]) == [
        ("card_created", kanban.admin.id, card_id),
        ("entered_done", kanban.admin.id, card_id),
    ]


def test_e17_in_a_plain_column_records_no_entered_done(client, kanban, app):
    t = seed_cards(kanban)
    kanban.tracker.record_card_from_response(post_card(client, kanban, t.todo, title="Plain"))
    assert _kinds(app, kanban.board_id) == ["card_created"]


@pytest.mark.parametrize("description", ["", "   \n ", None])
def test_blank_or_null_description_is_stored_as_null(client, kanban, app, description):
    t = seed_cards(kanban)
    response = post_card(client, kanban, t.todo, title="Blank", description=description)
    assert response.status_code == 201
    kanban.tracker.record_card_from_response(response)
    assert response.get_json()["data"]["card"]["description"] is None
    assert card_rows(app, t.todo)[-1]["description"] is None


def test_e17_assignee_must_be_an_active_participant(client, kanban, app, board_tracker):
    t = seed_cards(kanban)
    member = kanban.add_member("member", name="Mia")
    ok = post_card(client, kanban, t.todo, title="Assigned", assignee_id=str(member.id))
    assert ok.status_code == 201
    kanban.tracker.record_card_from_response(ok)
    card = ok.get_json()["data"]["card"]
    assert (card["assignee_id"], card["assignee_name"]) == (str(member.id), "Mia")

    outsider = board_tracker.make_user(name="Outsider")
    removed = kanban.add_member("member", name="Removed")
    soft_delete_membership(app, kanban.board_id, removed.id)
    snapshot = card_snapshot(app, kanban.board_id, [t.todo, t.doing])
    for bad in (outsider.id, removed.id, uuid.uuid4()):  # nonmember, removed member, unknown user
        response = post_card(client, kanban, t.todo, title="Nope", assignee_id=str(bad))
        assert response.status_code == 400, bad
        error = response.get_json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert error["fields"] == {"assignee_id": "Choose a participant of this board."}
    assert card_snapshot(app, kanban.board_id, [t.todo, t.doing]) == snapshot


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"title": ""},
        {"title": "x" * 161},
        {"title": "ok", "description": "d" * 2001},
        {"title": "ok", "x": 1},
    ],
)
def test_e17_invalid_bodies_are_400_and_create_nothing(client, kanban, app, body):
    t = seed_cards(kanban)
    before = card_snapshot(app, kanban.board_id, [t.todo, t.doing])
    response = client.post(f"/api/columns/{t.todo}/cards", json=body, headers=kanban.headers())
    assert response.status_code == 400
    assert card_snapshot(app, kanban.board_id, [t.todo, t.doing]) == before


def test_e18_updates_only_submitted_fields_and_leaves_position_and_version(client, kanban, app):
    t = seed_cards(kanban)
    member = kanban.add_member("member", name="Mia")
    url = f"/api/cards/{t.x1}"
    one = client.patch(url, json={"title": "New title"}, headers=kanban.headers())
    assert one.status_code == 200
    data = one.get_json()["data"]
    assert (data["title"], data["column_id"], data["order"]) == ("New title", str(t.todo), 1024.0)
    two = client.patch(
        url, json={"description": "Text", "assignee_id": str(member.id)}, headers=kanban.headers()
    )
    body = two.get_json()["data"]
    assert (body["title"], body["description"], body["assignee_name"]) == (
        "New title",
        "Text",
        "Mia",
    )
    assert board_version(app, kanban.board_id) == 0
    assert events(app, kanban.board_id) == []


def test_e18_explicit_null_clears_and_an_omitted_description_is_kept(client, kanban, app):
    t = seed_cards(kanban)
    member = kanban.add_member("member")
    url = f"/api/cards/{t.x1}"
    client.patch(
        url,
        json={"description": "Keep me", "assignee_id": str(member.id)},
        headers=kanban.headers(),
    )
    kept = client.patch(url, json={"title": "Renamed"}, headers=kanban.headers()).get_json()["data"]
    assert (kept["description"], kept["assignee_id"]) == ("Keep me", str(member.id))
    cleared = client.patch(
        url, json={"description": None, "assignee_id": None}, headers=kanban.headers()
    )
    data = cleared.get_json()["data"]
    assert (data["description"], data["assignee_id"], data["assignee_name"]) == (None, None, None)
    blank = client.patch(url, json={"description": "  "}, headers=kanban.headers()).get_json()[
        "data"
    ]
    assert blank["description"] is None


def test_e18_invalid_assignee_is_400_with_the_field_and_changes_nothing(
    client, kanban, app, board_tracker
):
    t = seed_cards(kanban)
    outsider = board_tracker.make_user()
    before = card_snapshot(app, kanban.board_id, [t.todo, t.doing])
    response = client.patch(
        f"/api/cards/{t.x1}",
        json={"title": "Changed", "assignee_id": str(outsider.id)},
        headers=kanban.headers(),
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"] == {
        "assignee_id": "Choose a participant of this board."
    }
    assert card_snapshot(app, kanban.board_id, [t.todo, t.doing]) == before


def test_e18_empty_body_is_a_body_level_400(client, kanban):
    t = seed_cards(kanban)
    response = client.patch(f"/api/cards/{t.x1}", json={}, headers=kanban.headers())
    assert response.status_code == 400
    assert "fields" not in response.get_json()["error"]


def test_e19_soft_deletes_the_card_and_returns_the_version(client, kanban, app):
    t = seed_cards(kanban)
    response = client.delete(f"/api/cards/{t.x2}", headers=kanban.headers())
    assert response.status_code == 200
    assert response.get_json() == {"data": {"position_version": 1}}
    assert card_titles(app, t.todo) == ["X1"]
    assert [r["title"] for r in card_rows(app, t.todo, include_deleted=True)] == ["X1", "X2"]
    assert events(app, kanban.board_id) == []


def test_e19_a_deleted_card_is_404_afterwards(client, kanban, app):
    t = seed_cards(kanban)
    client.delete(f"/api/cards/{t.x2}", headers=kanban.headers())
    again = client.delete(f"/api/cards/{t.x2}", headers=kanban.headers())
    edit = client.patch(f"/api/cards/{t.x2}", json={"title": "x"}, headers=kanban.headers())
    assert (again.status_code, edit.status_code) == (404, 404)


def test_e07_shows_the_result_of_each_card_write(client, kanban, app):
    t = seed_cards(kanban)
    member = kanban.add_member("member", name="Mia")
    created = post_card(client, kanban, t.todo, title="Fresh", assignee_id=str(member.id))
    kanban.tracker.record_card_from_response(created)
    client.patch(f"/api/cards/{t.x1}", json={"title": "Edited"}, headers=kanban.headers())
    client.delete(f"/api/cards/{t.x2}", headers=kanban.headers())
    columns = e07_columns(client, kanban.headers(), kanban.board_id)
    todo = next(c for c in columns if c["id"] == str(t.todo))
    assert [card["title"] for card in todo["cards"]] == ["Edited", "Fresh"]
    assert todo["cards"][1]["assignee_name"] == "Mia"


def test_cards_under_a_soft_deleted_column_are_404(client, kanban, app):
    from app.models.board_column import BoardColumn

    t = seed_cards(kanban)
    soft_delete(app, BoardColumn, t.todo)
    assert (
        client.patch(
            f"/api/cards/{t.x1}", json={"title": "x"}, headers=kanban.headers()
        ).status_code
        == 404
    )
    assert post_card(client, kanban, t.todo, title="x").status_code == 404
