"""Helpers shared by the kanban tests (columns now, cards in group 5).

Every row is created through `board_tracker`, which removes it after the test even on failure
(Requirement 11.7). Helpers that read the database open their own app context and remove the
session afterwards, so they never share a transaction with a request under test.
"""

from __future__ import annotations

import json
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select, update

from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.board_event import BoardEvent
from app.models.board_member import BoardMember
from app.models.card import Card
from tests.auth_helpers import bearer

FIXTURE = Path(__file__).resolve().parents[2] / "specs" / "fixtures" / "kanban-field-cases.json"
MAX_VERSION = 2_147_483_647
THREAD_TIMEOUT_SECONDS = 60


def load_cases() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def resolve(value: Any) -> Any:
    """Expand the fixture's `{"repeat": s, "times": n}` values."""
    if isinstance(value, dict) and "repeat" in value:
        return value["repeat"] * value["times"]
    return value


def build_body(form: dict, case: dict) -> dict:
    body = dict(form["base"])
    body.update(case["set"])
    for key in case["drop"]:
        body.pop(key, None)
    return {key: resolve(value) for key, value in body.items()}


@dataclass(frozen=True)
class Kanban:
    """A board with an admin. Members are added with `add_member`."""

    tracker: Any
    app: Any
    admin: Any
    board_id: uuid.UUID

    def headers(self, user: Any | None = None) -> dict[str, str]:
        return bearer(self.tracker.token_for((user or self.admin).id))

    def add_member(self, role: str = "member", name: str = "Member") -> Any:
        user = self.tracker.make_user(name=name)
        self.tracker.make_membership(self.board_id, user.id, role)
        return user


def make_kanban(board_tracker, app, name: str = "Kanban board") -> Kanban:
    admin = board_tracker.make_user(name="Admin")
    board_id = board_tracker.make_board(admin.id, name=name)
    board_tracker.make_membership(board_id, admin.id, "admin")
    return Kanban(tracker=board_tracker, app=app, admin=admin, board_id=board_id)


def _read(app, work: Callable[[], Any]) -> Any:
    with app.app_context():
        try:
            return work()
        finally:
            db.session.remove()


def _write(app, work: Callable[[], None]) -> None:
    with app.app_context():
        try:
            work()
            db.session.commit()
        finally:
            db.session.remove()


def board_version(app, board_id: uuid.UUID) -> int:
    return _read(
        app, lambda: db.session.scalar(select(Board.position_version).where(Board.id == board_id))
    )


def set_version(app, board_id: uuid.UUID, version: int) -> None:
    _write(
        app,
        lambda: db.session.execute(
            update(Board).where(Board.id == board_id).values(position_version=version)
        ),
    )


def events(app, board_id: uuid.UUID) -> list[tuple[str, uuid.UUID, uuid.UUID | None]]:
    def work():
        rows = db.session.execute(
            select(BoardEvent.kind, BoardEvent.actor_id, BoardEvent.card_id)
            .where(BoardEvent.board_id == board_id)
            .order_by(BoardEvent.occurred_at, BoardEvent.id)
        ).all()
        return [(row.kind, row.actor_id, row.card_id) for row in rows]

    return _read(app, work)


def column_rows(app, board_id: uuid.UUID, *, include_deleted: bool = False) -> list[dict]:
    """Columns of the board as dictionaries, sorted by `(order, id)`."""

    def work():
        statement = select(BoardColumn).where(BoardColumn.board_id == board_id)
        if not include_deleted:
            statement = statement.where(BoardColumn.deleted_at.is_(None))
        rows = db.session.scalars(statement.order_by(BoardColumn.order, BoardColumn.id)).all()
        return [
            {
                "id": row.id,
                "name": row.name,
                "is_done": row.is_done,
                "order": row.order,
                "deleted_at": row.deleted_at,
                "updated_at": row.updated_at,
            }
            for row in rows
        ]

    return _read(app, work)


def column_snapshot(app, board_id: uuid.UUID) -> tuple:
    """Everything a rejected request must leave alone: columns, version and event count."""
    rows = [
        (r["id"], r["name"], r["is_done"], r["order"], r["deleted_at"])
        for r in column_rows(app, board_id, include_deleted=True)
    ]
    return (rows, board_version(app, board_id), len(events(app, board_id)))


def soft_delete(app, model: type, row_id: uuid.UUID) -> None:
    _write(
        app,
        lambda: db.session.execute(
            update(model).where(model.id == row_id).values(deleted_at=utcnow())
        ),
    )


def soft_delete_membership(app, board_id: uuid.UUID, user_id: uuid.UUID) -> None:
    _write(
        app,
        lambda: db.session.execute(
            update(BoardMember)
            .where(BoardMember.board_id == board_id, BoardMember.user_id == user_id)
            .values(deleted_at=utcnow())
        ),
    )


def card_count(app, column_id: uuid.UUID) -> int:
    return _read(
        app,
        lambda: len(
            db.session.scalars(
                select(Card.id).where(Card.column_id == column_id, Card.deleted_at.is_(None))
            ).all()
        ),
    )


def e07_columns(client, headers: dict[str, str], board_id: uuid.UUID) -> list[dict]:
    response = client.get(f"/api/boards/{board_id}", headers=headers)
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]["columns"]


def error_without_request_id(response) -> dict:
    """The error body minus the per-request ID, to compare envelopes across requests."""
    error = dict(response.get_json()["error"])
    error.pop("request_id", None)
    return error


def race(app, jobs: list[Callable[[Any], Any]]) -> list[Any]:
    """Run each job in its own thread and test client, released together. Results in job order."""
    barrier = threading.Barrier(len(jobs))
    results: list[Any] = [None] * len(jobs)
    errors: list[BaseException] = []

    def worker(index: int, job: Callable[[Any], Any]) -> None:
        try:
            barrier.wait(timeout=THREAD_TIMEOUT_SECONDS)
            results[index] = job(app.test_client())
        except Exception as exc:  # noqa: BLE001 - every thread failure must reach the test thread
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i, job)) for i, job in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=THREAD_TIMEOUT_SECONDS)
    assert not any(thread.is_alive() for thread in threads), "a request thread did not finish"
    assert not errors, errors
    return results


def post_column(client, kanban: Kanban, user: Any | None = None, **body) -> Any:
    return client.post(
        f"/api/boards/{kanban.board_id}/columns", json=body, headers=kanban.headers(user)
    )


def reorder(client, kanban: Kanban, column_id, before, version, user: Any | None = None) -> Any:
    return client.patch(
        f"/api/boards/{kanban.board_id}/columns/reorder",
        json={
            "column_id": str(column_id),
            "before_column_id": None if before is None else str(before),
            "expected_position_version": version,
        },
        headers=kanban.headers(user),
    )


@dataclass(frozen=True)
class ColumnTargets:
    """Three empty columns A, B, C (orders 1, 2, 3) on a board at version 0."""

    a: uuid.UUID
    b: uuid.UUID
    c: uuid.UUID


def seed_columns(kanban: Kanban) -> ColumnTargets:
    tracker = kanban.tracker
    return ColumnTargets(
        a=tracker.make_column(kanban.board_id, "A", order=1.0),
        b=tracker.make_column(kanban.board_id, "B", order=2.0),
        c=tracker.make_column(kanban.board_id, "C", order=3.0),
    )


def column_requests(kanban: Kanban, cols: ColumnTargets) -> dict[str, Callable[..., Any]]:
    """One valid request for each of E13 to E16, as `fn(client, headers) -> response`.

    E15 deletes an empty column and E16 moves C before A at version 0.
    """
    board = kanban.board_id
    return {
        "E13": lambda c, h: c.post(f"/api/boards/{board}/columns", json={"name": "New"}, headers=h),
        "E14": lambda c, h: c.patch(f"/api/columns/{cols.b}", json={"name": "Renamed"}, headers=h),
        "E15": lambda c, h: c.delete(f"/api/columns/{cols.b}", headers=h),
        "E16": lambda c, h: c.patch(
            f"/api/boards/{board}/columns/reorder",
            json={
                "column_id": str(cols.c),
                "before_column_id": str(cols.a),
                "expected_position_version": 0,
            },
            headers=h,
        ),
    }


def invalid_column_requests(kanban: Kanban, cols: ColumnTargets) -> dict[str, Callable[..., Any]]:
    """A request with a body that fails shape validation, for E13, E14 and E16."""
    board = kanban.board_id
    return {
        "E13": lambda c, h: c.post(f"/api/boards/{board}/columns", json={"name": ""}, headers=h),
        "E14": lambda c, h: c.patch(f"/api/columns/{cols.b}", json={}, headers=h),
        "E16": lambda c, h: c.patch(
            f"/api/boards/{board}/columns/reorder",
            json={"column_id": "bad", "before_column_id": None, "expected_position_version": 0},
            headers=h,
        ),
    }


@dataclass(frozen=True)
class CardTargets:
    """Two empty-ish columns with cards: `todo` holds x1 and x2, `doing` holds y1. Version 0."""

    todo: uuid.UUID
    doing: uuid.UUID
    x1: uuid.UUID
    x2: uuid.UUID
    y1: uuid.UUID


def seed_cards(kanban: Kanban, *, doing_is_done: bool = False) -> CardTargets:
    tracker = kanban.tracker
    todo = tracker.make_column(kanban.board_id, "Todo", order=1024.0)
    doing = tracker.make_column(kanban.board_id, "Doing", order=2048.0)
    if doing_is_done:
        set_done(kanban.app, doing)
    return CardTargets(
        todo=todo,
        doing=doing,
        x1=tracker.make_card(todo, "X1", order=1024.0),
        x2=tracker.make_card(todo, "X2", order=2048.0),
        y1=tracker.make_card(doing, "Y1", order=1024.0),
    )


def set_done(app, column_id: uuid.UUID) -> None:
    _write(
        app,
        lambda: db.session.execute(
            update(BoardColumn).where(BoardColumn.id == column_id).values(is_done=True)
        ),
    )


def card_rows(app, column_id: uuid.UUID, *, include_deleted: bool = False) -> list[dict]:
    """Cards of a column as dictionaries, sorted by `(order, id)`."""

    def work():
        statement = select(Card).where(Card.column_id == column_id)
        if not include_deleted:
            statement = statement.where(Card.deleted_at.is_(None))
        rows = db.session.scalars(statement.order_by(Card.order, Card.id)).all()
        return [
            {
                "id": r.id,
                "title": r.title,
                "description": r.description,
                "assignee_id": r.assignee_id,
                "order": r.order,
                "deleted_at": r.deleted_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]

    return _read(app, work)


def card_titles(app, column_id: uuid.UUID) -> list[str]:
    return [r["title"] for r in card_rows(app, column_id)]


def card_snapshot(app, board_id: uuid.UUID, column_ids: list[uuid.UUID]) -> tuple:
    """Everything a rejected card request must leave alone."""
    cards = [
        (r["id"], r["title"], r["description"], r["assignee_id"], r["order"], r["deleted_at"])
        for cid in column_ids
        for r in card_rows(app, cid, include_deleted=True)
    ]
    return (cards, column_snapshot(app, board_id))


def card_requests(kanban: Kanban, t: CardTargets) -> dict[str, Callable[..., Any]]:
    """One valid request for each of E17 to E20, as `fn(client, headers) -> response`.

    E19 deletes x2. E20 moves x1 to the end of Doing at version 0.
    """
    return {
        "E17": lambda c, h: c.post(
            f"/api/columns/{t.todo}/cards", json={"title": "New"}, headers=h
        ),
        "E18": lambda c, h: c.patch(f"/api/cards/{t.x1}", json={"title": "Renamed"}, headers=h),
        "E19": lambda c, h: c.delete(f"/api/cards/{t.x2}", headers=h),
        "E20": lambda c, h: c.patch(
            f"/api/cards/{t.x1}/position",
            json={
                "column_id": str(t.doing),
                "before_card_id": None,
                "expected_position_version": 0,
            },
            headers=h,
        ),
    }


def invalid_card_requests(kanban: Kanban, t: CardTargets) -> dict[str, Callable[..., Any]]:
    """A request with a body that fails shape validation, for E17, E18 and E20."""
    return {
        "E17": lambda c, h: c.post(f"/api/columns/{t.todo}/cards", json={"title": ""}, headers=h),
        "E18": lambda c, h: c.patch(f"/api/cards/{t.x1}", json={}, headers=h),
        "E20": lambda c, h: c.patch(
            f"/api/cards/{t.x1}/position",
            json={"column_id": "bad", "before_card_id": None, "expected_position_version": 0},
            headers=h,
        ),
    }


def move(client, kanban: Kanban, card_id, column_id, before, version, user: Any | None = None):
    return client.patch(
        f"/api/cards/{card_id}/position",
        json={
            "column_id": str(column_id),
            "before_card_id": None if before is None else str(before),
            "expected_position_version": version,
        },
        headers=kanban.headers(user),
    )


def post_card(client, kanban: Kanban, column_id, user: Any | None = None, **body):
    return client.post(f"/api/columns/{column_id}/cards", json=body, headers=kanban.headers(user))
