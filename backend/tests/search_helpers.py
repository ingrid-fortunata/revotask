"""Helpers for the My Tasks and card search tests (T11)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from tests.kanban_helpers import Kanban, make_kanban

FIXTURE = Path(__file__).resolve().parents[2] / "specs" / "fixtures" / "search-query-cases.json"
CARD_FIELDS = {
    "id",
    "column_id",
    "title",
    "description",
    "assignee_id",
    "assignee_name",
    "order",
    "board_id",
    "board_name",
    "column_name",
    "is_done",
}
SEARCH_FIELDS = {"id", "title", "column_id"}
STANDARD_MESSAGE = "Check the submitted fields."


def load_query_cases() -> dict[str, list[dict[str, Any]]]:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return {"e21": data["e21"], "e22": data["e22"]}


def expand(query: str) -> str:
    return query.replace("{A100}", "A" * 100).replace("{A101}", "A" * 101)


def case_ids(cases: list[dict[str, Any]]) -> list[str]:
    return [case["name"] for case in cases]


def titles(response) -> list[str]:
    return [item["title"] for item in response.get_json()["data"]]


def my_tasks_get(client, headers: dict[str, str], query: str = "assignee=me"):
    return client.get(f"/api/cards?{query}", headers=headers)


def search_get(client, headers: dict[str, str], board_id: uuid.UUID, q: str):
    return client.get(
        f"/api/boards/{board_id}/cards/search", query_string={"q": q}, headers=headers
    )


def make_world(board_tracker, app, name: str = "Search board") -> Kanban:
    """A board with an admin, one active column `Todo` and no cards."""
    kanban = make_kanban(board_tracker, app, name=name)
    return kanban
