"""E21 and E22 query validation (task 2.1; Requirements 1.7, 2.5, 3.1; decisions S3 and Q4)."""

from __future__ import annotations

import pytest

from app.blueprints.cards import service
from tests.search_helpers import (
    STANDARD_MESSAGE,
    case_ids,
    expand,
    load_query_cases,
    make_world,
)

CASES = load_query_cases()


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    return make_world(board_tracker, app)


@pytest.fixture
def no_reads(monkeypatch):
    """A 400 must not reach the service, so the service raises if it is called."""

    def fail(*args, **kwargs):
        raise AssertionError("a rejected query reached the service")

    monkeypatch.setattr(service, "my_tasks", fail)
    monkeypatch.setattr(service, "search_cards", fail)


def _check(response, case):
    assert response.status_code == case["status"], response.get_json()
    if case["status"] == 200:
        return
    error = response.get_json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["message"] == STANDARD_MESSAGE
    if case["fields"] is None:
        assert "fields" not in error
    else:
        assert error["fields"] == case["fields"]
    # An unknown key is never reported as a field.
    assert "foo" not in error.get("fields", {})


@pytest.mark.parametrize("case", CASES["e21"], ids=case_ids(CASES["e21"]))
def test_e21_query_cases(client, world, case, no_reads, monkeypatch):
    if case["status"] == 200:
        monkeypatch.undo()
    response = client.get(f"/api/cards?{expand(case['query'])}", headers=world.headers())
    _check(response, case)


@pytest.mark.parametrize("case", CASES["e22"], ids=case_ids(CASES["e22"]))
def test_e22_query_cases(client, world, case, no_reads, monkeypatch):
    if case["status"] == 200:
        monkeypatch.undo()
    url = f"/api/boards/{world.board_id}/cards/search?{expand(case['query'])}"
    response = client.get(url, headers=world.headers())
    _check(response, case)


def test_a_missing_token_wins_over_a_bad_query(client, world):
    assert client.get("/api/cards?foo=bar").status_code == 401
    assert client.get(f"/api/boards/{world.board_id}/cards/search?q=").status_code == 401


def test_a_bad_path_id_wins_over_a_bad_query(client, world):
    response = client.get("/api/boards/not-a-uuid/cards/search?q=", headers=world.headers())
    assert response.status_code == 400
    assert "fields" not in response.get_json()["error"]


def test_a_bad_query_from_a_nonmember_is_400_not_404(client, board_tracker, world):
    outsider = board_tracker.make_user(name="Outsider")
    headers = {"Authorization": f"Bearer {board_tracker.token_for(outsider.id)}"}
    bad = client.get(f"/api/boards/{world.board_id}/cards/search?q=", headers=headers)
    good = client.get(f"/api/boards/{world.board_id}/cards/search?q=x", headers=headers)
    assert (bad.status_code, good.status_code) == (400, 404)
