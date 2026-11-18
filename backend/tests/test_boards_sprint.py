"""Revision 2 board sprint tests for E05 to E08 (Requirement 8; P18 to P21).

Every row is created through `board_tracker`, which removes it after the test. The same field
cases that the schema tests and the frontend rules read drive the validation rows here.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import select

from app.extensions import db
from app.models.board import Board
from tests.auth_cases import expand
from tests.auth_helpers import bearer

CASES_PATH = Path(__file__).resolve().parents[2] / "specs" / "fixtures" / "board-field-cases.json"
SUMMARY_KEYS = {"id", "name", "role", "position_version", "sprint_start", "sprint_end"}
SPRINT = {"sprint_start": "2026-11-16", "sprint_end": "2026-11-22"}
NO_SPRINT = {"sprint_start": None, "sprint_end": None}


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def _cases(form: str, *, accepted: bool):
    data = json.loads(CASES_PATH.read_text(encoding="utf-8"))[form]
    base = expand(data["base"])
    params = []
    for case in data["cases"]:
        expect = expand(case["expect"])
        if ("accepted" in expect) != accepted:
            continue
        body = {**base, **expand(case["set"])}
        for key in case["drop"]:
            body.pop(key, None)
        params.append(pytest.param(body, expect, id=case["id"]))
    return params


def _seed(board_tracker, **sprint):
    admin = board_tracker.make_user(name="Sprint Admin")
    member = board_tracker.make_user(name="Sprint Member")
    board_id = board_tracker.make_board(admin.id, name="Sprint board")
    board_tracker.make_membership(board_id, admin.id, "admin")
    board_tracker.make_membership(board_id, member.id, "member")
    if sprint:
        _set_sprint(board_tracker, board_id, **sprint)
    return board_id, admin.id, member.id


def _set_sprint(board_tracker, board_id, start, end):
    with board_tracker.app.app_context():
        try:
            db.session.execute(
                Board.__table__.update()
                .where(Board.id == board_id)
                .values(sprint_start=date.fromisoformat(start), sprint_end=date.fromisoformat(end))
            )
            db.session.commit()
        finally:
            db.session.remove()


def _row(app, board_id) -> tuple[Any, ...]:
    with app.app_context():
        try:
            return tuple(
                db.session.execute(
                    select(Board.name, Board.sprint_start, Board.sprint_end)
                    .where(Board.id == board_id)
                    .execution_options(populate_existing=True)
                ).one()
            )
        finally:
            db.session.remove()


def _headers(board_tracker, user_id):
    return bearer(board_tracker.token_for(user_id))


def _board_count(app) -> int:
    with app.app_context():
        try:
            return len(db.session.scalars(select(Board.id)).all())
        finally:
            db.session.remove()


# E06 create


def test_create_with_a_sprint_returns_both_dates(client, board_tracker):
    user = board_tracker.make_user(name="Creator")
    response = client.post(
        "/api/boards",
        json={"name": "With sprint", **SPRINT},
        headers=_headers(board_tracker, user.id),
    )
    assert response.status_code == 201
    data = response.get_json()["data"]
    board_tracker.record_board_from_response(response)
    assert set(data) == SUMMARY_KEYS
    assert data["role"] == "admin"
    assert {k: data[k] for k in SPRINT} == SPRINT


@pytest.mark.parametrize("extra", [{}, NO_SPRINT], ids=["sprint-omitted", "both-null"])
def test_create_without_a_sprint_returns_nulls(client, board_tracker, extra):
    user = board_tracker.make_user(name="Creator")
    response = client.post(
        "/api/boards", json={"name": "No sprint", **extra}, headers=_headers(board_tracker, user.id)
    )
    assert response.status_code == 201
    board_tracker.record_board_from_response(response)
    data = response.get_json()["data"]
    assert (data["sprint_start"], data["sprint_end"]) == (None, None)


@pytest.mark.parametrize(("body", "expect"), _cases("board_sprint_create", accepted=False))
def test_create_rejects_invalid_sprints_and_creates_nothing(
    client, app, board_tracker, body, expect
):
    user = board_tracker.make_user(name="Creator")
    before = _board_count(app)
    response = client.post("/api/boards", json=body, headers=_headers(board_tracker, user.id))
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["fields"] == expect["fields"]
    assert _board_count(app) == before


@pytest.mark.parametrize(("body", "expect"), _cases("board_sprint_create", accepted=True))
def test_create_stores_exactly_the_accepted_sprint(client, app, board_tracker, body, expect):
    user = board_tracker.make_user(name="Creator")
    response = client.post("/api/boards", json=body, headers=_headers(board_tracker, user.id))
    assert response.status_code == 201
    board_id = board_tracker.record_board_from_response(response)
    _, start, end = _row(app, board_id)
    assert (start.isoformat() if start else None) == body.get("sprint_start")
    assert (end.isoformat() if end else None) == body.get("sprint_end")


# E05 and E07 carry the keys for every role


def test_list_and_detail_carry_the_sprint_for_admin_and_member(client, board_tracker):
    board_id, admin_id, member_id = _seed(board_tracker, start="2026-11-16", end="2026-11-22")
    for user_id, role in ((admin_id, "admin"), (member_id, "member")):
        headers = _headers(board_tracker, user_id)
        listed = client.get("/api/boards", headers=headers).get_json()["data"]
        item = next(b for b in listed if b["id"] == str(board_id))
        detail = client.get(f"/api/boards/{board_id}", headers=headers).get_json()["data"]
        for shape in (item, detail):
            assert shape["role"] == role
            assert {k: shape[k] for k in SPRINT} == SPRINT
        assert set(item) == SUMMARY_KEYS
        assert set(detail) == SUMMARY_KEYS | {"columns"}


def test_a_board_without_a_sprint_lists_and_opens_with_nulls(client, board_tracker):
    board_id, admin_id, _ = _seed(board_tracker)
    headers = _headers(board_tracker, admin_id)
    item = next(
        b
        for b in client.get("/api/boards", headers=headers).get_json()["data"]
        if b["id"] == str(board_id)
    )
    detail = client.get(f"/api/boards/{board_id}", headers=headers).get_json()["data"]
    for shape in (item, detail):
        assert (shape["sprint_start"], shape["sprint_end"]) == (None, None)


# E08 update


def test_update_name_only_keeps_the_sprint(client, app, board_tracker):
    board_id, admin_id, _ = _seed(board_tracker, start="2026-11-16", end="2026-11-22")
    response = client.patch(
        f"/api/boards/{board_id}",
        json={"name": "Renamed"},
        headers=_headers(board_tracker, admin_id),
    )
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["name"] == "Renamed"
    assert {k: data[k] for k in SPRINT} == SPRINT
    assert _row(app, board_id) == ("Renamed", date(2026, 11, 16), date(2026, 11, 22))


def test_update_sprint_only_keeps_the_name(client, app, board_tracker):
    board_id, admin_id, _ = _seed(board_tracker)
    response = client.patch(
        f"/api/boards/{board_id}", json=SPRINT, headers=_headers(board_tracker, admin_id)
    )
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["name"] == "Sprint board"
    assert {k: data[k] for k in SPRINT} == SPRINT
    assert _row(app, board_id) == ("Sprint board", date(2026, 11, 16), date(2026, 11, 22))


def test_update_name_and_sprint_together(client, app, board_tracker):
    board_id, admin_id, _ = _seed(board_tracker)
    response = client.patch(
        f"/api/boards/{board_id}",
        json={"name": "Both", **SPRINT},
        headers=_headers(board_tracker, admin_id),
    )
    assert response.status_code == 200
    assert _row(app, board_id) == ("Both", date(2026, 11, 16), date(2026, 11, 22))


def test_update_with_two_nulls_clears_the_sprint_and_keeps_the_name(client, app, board_tracker):
    board_id, admin_id, _ = _seed(board_tracker, start="2026-11-16", end="2026-11-22")
    response = client.patch(
        f"/api/boards/{board_id}", json=NO_SPRINT, headers=_headers(board_tracker, admin_id)
    )
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert (data["sprint_start"], data["sprint_end"], data["name"]) == (None, None, "Sprint board")
    assert _row(app, board_id) == ("Sprint board", None, None)


@pytest.mark.parametrize(("body", "expect"), _cases("board_sprint_update", accepted=False))
def test_update_rejects_invalid_bodies_and_changes_nothing(
    client, app, board_tracker, body, expect
):
    board_id, admin_id, _ = _seed(board_tracker, start="2026-12-01", end="2026-12-07")
    before = _row(app, board_id)
    response = client.patch(
        f"/api/boards/{board_id}", json=body, headers=_headers(board_tracker, admin_id)
    )
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["fields"] == expect["fields"]
    assert _row(app, board_id) == before


@pytest.mark.parametrize(("body", "expect"), _cases("board_sprint_update", accepted=True))
def test_update_applies_only_the_submitted_fields(client, app, board_tracker, body, expect):
    board_id, admin_id, _ = _seed(board_tracker, start="2026-12-01", end="2026-12-07")
    name, start, end = _row(app, board_id)
    response = client.patch(
        f"/api/boards/{board_id}", json=body, headers=_headers(board_tracker, admin_id)
    )
    assert response.status_code == 200
    got_name, got_start, got_end = _row(app, board_id)
    assert got_name == body.get("name", name)
    if "sprint_start" in body:
        assert (got_start.isoformat() if got_start else None) == body["sprint_start"]
        assert (got_end.isoformat() if got_end else None) == body["sprint_end"]
    else:
        assert (got_start, got_end) == (start, end)


def test_member_gets_403_and_nothing_changes(client, app, board_tracker):
    board_id, _, member_id = _seed(board_tracker, start="2026-12-01", end="2026-12-07")
    before = _row(app, board_id)
    response = client.patch(
        f"/api/boards/{board_id}", json=SPRINT, headers=_headers(board_tracker, member_id)
    )
    assert response.status_code == 403
    assert _row(app, board_id) == before


def test_nonmember_gets_the_board_404(client, board_tracker):
    board_id, _, _ = _seed(board_tracker)
    stranger = board_tracker.make_user(name="Stranger")
    response = client.patch(
        f"/api/boards/{board_id}", json=SPRINT, headers=_headers(board_tracker, stranger.id)
    )
    assert response.status_code == 404


def test_an_invalid_body_is_400_before_the_member_403_and_the_nonmember_404(client, board_tracker):
    board_id, _, member_id = _seed(board_tracker)
    stranger = board_tracker.make_user(name="Stranger")
    bad = {"sprint_start": "2026-11-16"}
    for user_id in (member_id, stranger.id):
        response = client.patch(
            f"/api/boards/{board_id}", json=bad, headers=_headers(board_tracker, user_id)
        )
        assert response.status_code == 400


def test_a_sprint_accepted_by_the_api_never_reaches_the_database_constraint(client, board_tracker):
    """Every fixture body the API accepts also satisfies `ck_boards_sprint_range_valid`.

    A 500 here would mean the API rule and the constraint disagree (design "Error Handling").
    """
    user = board_tracker.make_user(name="Creator")
    for param in _cases("board_sprint_create", accepted=True):
        body = param.values[0]
        response = client.post("/api/boards", json=body, headers=_headers(board_tracker, user.id))
        assert response.status_code == 201, param.id
        board_tracker.record_board_from_response(response)
