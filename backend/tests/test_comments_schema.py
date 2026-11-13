"""Request schema and serializer of the comments API (task 2.1).

Properties 1 (content rule) and 2 (response allowlist). The field cases come from
`specs/fixtures/comment-field-cases.json`, which the frontend rule tests read as well. The UTC
check runs one query on the guarded test database inside a rolled-back transaction.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest
from marshmallow import ValidationError
from sqlalchemy import text

from app.blueprints.comments import service
from app.blueprints.comments.schema import CommentContentSchema, CommentSchema
from app.extensions import db
from app.validation import first_messages
from tests.comments_helpers import make_comment_row
from tests.kanban_helpers import build_body, make_kanban, resolve

FIXTURE = Path(__file__).resolve().parents[2] / "specs" / "fixtures" / "comment-field-cases.json"
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))
FORM = CASES["comment_content"]


@pytest.mark.parametrize("case", FORM["cases"], ids=lambda case: case["id"])
def test_property_1_content_follows_the_shared_cases(case):
    body = build_body(FORM, case)
    kind = next(iter(case["expect"]))
    if kind == "accepted":
        loaded = CommentContentSchema().load(body)
        assert loaded == {k: resolve(v) for k, v in case["expect"]["accepted"].items()}
        return
    with pytest.raises(ValidationError) as raised:
        CommentContentSchema().load(body)
    assert first_messages(raised.value.messages) == case["expect"]["fields"]


@pytest.mark.parametrize("value", [["x"], {"a": 1}, True, 1.5])
def test_property_1_non_text_content_is_rejected(value):
    with pytest.raises(ValidationError) as raised:
        CommentContentSchema().load({"content": value})
    assert first_messages(raised.value.messages) == {"content": "Must be text."}


def test_property_1_unknown_fields_are_rejected():
    with pytest.raises(ValidationError) as raised:
        CommentContentSchema().load({"content": "ok", "author_id": str(uuid.uuid4())})
    assert first_messages(raised.value.messages) == {"author_id": "Unknown field."}


def test_the_fixture_has_unique_case_ids():
    ids = [case["id"] for case in FORM["cases"]]
    assert len(ids) == len(set(ids))


def test_property_2_response_has_exactly_the_documented_fields():
    leaky = {
        "id": uuid.uuid4(),
        "card_id": uuid.uuid4(),
        "author_id": uuid.uuid4(),
        "author_name": "Mia",
        "content": "Hi",
        "created_at": datetime(2026, 1, 1, tzinfo=UTC),
        "updated_at": datetime(2026, 1, 1, tzinfo=UTC),
        "deleted_at": None,
        "email": "a@b.c",
        "password_hash": "x",
    }
    assert set(CommentSchema().dump(leaky)) == {
        "id",
        "card_id",
        "author_id",
        "author_name",
        "content",
        "created_at",
        "updated_at",
    }


def test_timestamps_are_written_as_utc_iso_8601():
    moment = datetime(2026, 1, 1, 12, 0, tzinfo=timezone(timedelta(hours=7)))
    dumped = CommentSchema().dump({"created_at": moment, "updated_at": moment})
    assert dumped["created_at"] == "2026-01-01T05:00:00+00:00"
    assert dumped["updated_at"] == "2026-01-01T05:00:00+00:00"


def test_timestamps_are_utc_even_when_the_connection_uses_another_time_zone(app, board_tracker):
    kanban = make_kanban(board_tracker, app)
    column = board_tracker.make_column(kanban.board_id, "Todo", order=1024.0)
    card = board_tracker.make_card(column, "Card", order=1024.0)
    make_comment_row(app, card, kanban.admin.id, "Zone check")
    with app.app_context():
        try:
            # SET LOCAL lasts for this transaction only, so the pooled connection is not changed.
            db.session.execute(text("SET LOCAL TIME ZONE 'Asia/Jakarta'"))
            rows = service._comment_rows(card)
            raw = rows[0]["created_at"]
            assert raw.utcoffset() == timedelta(hours=7)  # the driver returned local time
            dumped = CommentSchema(many=True).dump(rows)[0]
            assert dumped["created_at"].endswith("+00:00")
            assert datetime.fromisoformat(dumped["created_at"]) == raw
        finally:
            db.session.rollback()
            db.session.remove()
