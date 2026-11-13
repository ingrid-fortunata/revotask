"""Structure of `specs/fixtures/kanban-field-cases.json` (task 2.5).

The schema tests (tasks 3.6 and 5.6) and the frontend rule tests read this file. This test checks
only that it is well formed, so a typo in the fixture fails here and not as a confusing schema
failure later.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

FIXTURE = Path(__file__).resolve().parents[2] / "specs" / "fixtures" / "kanban-field-cases.json"
FORMS = [
    "column_create",
    "column_update",
    "column_reorder",
    "card_create",
    "card_update",
    "card_position",
]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


@pytest.fixture(scope="module")
def doc() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_has_the_six_forms(doc):
    assert [name for name in doc if not name.startswith("_")] == FORMS


@pytest.mark.parametrize("form", FORMS)
def test_each_case_has_a_unique_id_and_one_valid_expectation(doc, form):
    ids = [case["id"] for case in doc[form]["cases"]]
    assert len(ids) == len(set(ids)), f"duplicate case id in {form}"
    for case in doc[form]["cases"]:
        assert set(case) == {"id", "set", "drop", "expect"}, case["id"]
        assert len(case["expect"]) == 1, case["id"]
        kind = next(iter(case["expect"]))
        assert kind in {"accepted", "fields", "rejected_without_fields"}, case["id"]
        assert all(key in doc[form]["base"] for key in case["drop"]), case["id"]


@pytest.mark.parametrize("form", ["column_reorder", "card_position"])
def test_move_forms_cover_the_version_range_and_the_anchor_rules(doc, form):
    ids = {case["id"] for case in doc[form]["cases"]}
    assert {
        "version-0",
        "version-max",
        "version-over-max",
        "version-negative",
        "version-float",
        "version-true",
        "version-string",
        "version-missing",
    } <= ids
    assert any(i.endswith("-null-means-end") for i in ids)
    assert any(i.endswith("-missing") and i.startswith("before_") for i in ids)
    base = doc[form]["base"]
    assert all(UUID.match(base[key]) for key in base if key != "expected_position_version")


def test_description_blank_values_normalize_to_null(doc):
    cases = {case["id"]: case for case in doc["card_create"]["cases"]}
    for case_id in ("description-empty-is-null", "description-spaces-is-null"):
        assert cases[case_id]["expect"]["accepted"]["description"] is None
