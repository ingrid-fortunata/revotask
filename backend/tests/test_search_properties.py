"""Properties 1 to 5 for E21 and E22 as parameterized tables (task 2.4).

Property 1 and 2 (task scope and order) and 3 and 4 (search scope, cap, literal wildcards) have
their own tables in `test_my_tasks.py` and `test_card_search.py`. This file holds the cross-cutting
cases: a combined scope table, and property 5 (read-only and query strictness) over both routes.
"""

from __future__ import annotations

import pytest

from tests.kanban_helpers import board_version, events
from tests.search_helpers import case_ids, expand, load_query_cases, make_world

CASES = load_query_cases()


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


@pytest.fixture
def world(board_tracker, app):
    kanban = make_world(board_tracker, app)
    column = board_tracker.make_column(kanban.board_id, "Todo")
    card = board_tracker.make_card(column, "Hit card", assignee_id=kanban.admin.id)
    return kanban, card


@pytest.mark.parametrize("case", CASES["e21"], ids=case_ids(CASES["e21"]))
def test_property_5_e21_never_writes_and_a_bad_query_reads_no_card(client, world, app, case):
    kanban, _card = world
    before = (events(app, kanban.board_id), board_version(app, kanban.board_id))
    response = client.get(f"/api/cards?{expand(case['query'])}", headers=kanban.headers())
    assert response.status_code == case["status"]
    if case["status"] == 400:
        assert "data" not in response.get_json()
    assert (events(app, kanban.board_id), board_version(app, kanban.board_id)) == before


@pytest.mark.parametrize("case", CASES["e22"], ids=case_ids(CASES["e22"]))
def test_property_5_e22_never_writes_and_a_bad_query_reads_no_card(client, world, app, case):
    kanban, _card = world
    before = (events(app, kanban.board_id), board_version(app, kanban.board_id))
    url = f"/api/boards/{kanban.board_id}/cards/search?{expand(case['query'])}"
    response = client.get(url, headers=kanban.headers())
    assert response.status_code == case["status"]
    if case["status"] == 400:
        assert "data" not in response.get_json()
    assert (events(app, kanban.board_id), board_version(app, kanban.board_id)) == before
