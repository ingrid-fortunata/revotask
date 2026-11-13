"""Loader for specs/fixtures/auth-field-cases.json, shared with the frontend tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CASES_PATH = Path(__file__).resolve().parents[2] / "specs" / "fixtures" / "auth-field-cases.json"


def expand(value: Any) -> Any:
    if isinstance(value, dict) and set(value) == {"repeat", "times"}:
        return value["repeat"] * value["times"]
    if isinstance(value, dict) and set(value) == {"concat"}:
        return "".join(expand(part) for part in value["concat"])
    if isinstance(value, dict):
        return {k: expand(v) for k, v in value.items()}
    if isinstance(value, list):
        return [expand(v) for v in value]
    return value


def load_cases(form: str) -> tuple[dict, list[tuple[str, dict, dict]]]:
    """Return (base, [(case id, request body, expectation)]) for 'register' or 'login'."""
    data = json.loads(CASES_PATH.read_text(encoding="utf-8"))[form]
    base = expand(data["base"])
    cases = []
    for case in data["cases"]:
        body = {**base, **expand(case["set"])}
        for key in case["drop"]:
            body.pop(key, None)
        cases.append((case["id"], body, expand(case["expect"])))
    return base, cases
