"""Parameterized tests for boards-membership Properties 1 to 3 (task 2.15).

Feature: boards-membership, Property 1: Board name rule
Feature: boards-membership, Property 2: Request schemas accept exactly their field set
Feature: boards-membership, Property 3: Member email rule and normalization

Each body goes through `app.validation.load_json_body` inside a bare Flask request context, the
same path the routes use. No database, application factory or fixture is needed.
"""

import json
import re
from pathlib import Path

import pytest
from flask import Flask
from marshmallow import RAISE

from app.blueprints.auth.schema import RegisterSchema
from app.blueprints.boards.schema import BoardCreateSchema, BoardUpdateSchema, MemberAddSchema
from app.exceptions import RequestValidationError
from app.validation import load_json_body
from tests.auth_cases import expand, load_cases

BOARD_CASES_PATH = (
    Path(__file__).resolve().parents[2] / "specs" / "fixtures" / "board-field-cases.json"
)

REQUIRED = "Required."
UNKNOWN = "Unknown field."
NAME_LENGTH = "Must be 1 to 100 characters."
EMAIL_FORMAT = "Enter a valid email address."
EMAIL_LENGTH = "Must be at most 254 characters."
EMAIL_MAX = 254
NAME_MAX = 100

# An independent statement of the shared email pattern (design Property 3).
EMAIL_PATTERN = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")

_APP = Flask("boards-membership-properties")


def run_body(schema_cls, body):
    """Return (loaded, None) on success or (None, RequestValidationError) on failure."""
    with _APP.test_request_context(json=body):
        try:
            return load_json_body(schema_cls()), None
        except RequestValidationError as exc:
            return None, exc


def _board_case_params(form):
    """Expand one form's cases from board-field-cases.json, as auth_cases.load_cases does."""
    data = json.loads(BOARD_CASES_PATH.read_text(encoding="utf-8"))[form]
    base = expand(data["base"])
    params = []
    for case in data["cases"]:
        body = {**base, **expand(case["set"])}
        for key in case["drop"]:
            body.pop(key, None)
        params.append(pytest.param(body, expand(case["expect"]), id=case["id"]))
    return params


def _assert_fixture_outcome(loaded, exc, expect, keys):
    if "fields" in expect:
        assert loaded is None, f"accepted a body the fixture rejects: {loaded}"
        assert exc.status == 400
        assert exc.code == "VALIDATION_ERROR"
        assert exc.fields == expect["fields"]
        return
    assert exc is None, f"rejected a body the fixture accepts: {exc.fields}"
    assert set(loaded) == keys
    for name, value in expect["accepted"].items():
        assert loaded[name] == value


# ---------------------------------------------------------------------------
# Property 1: Board name rule
# Feature: boards-membership, Property 1: Board name rule
# **Validates: Requirements 1.1, 1.2, 1.8, 3.1, 3.4**
# ---------------------------------------------------------------------------

NAME_SCHEMAS = [
    pytest.param(BoardCreateSchema, id="E06"),
    pytest.param(BoardUpdateSchema, id="E08"),
]

# Strings on the trimming and length boundaries. Lengths count Unicode code points.
NAME_VALUES = {
    "empty": "",
    "spaces-and-tabs-only": " \t\n ",
    "one-char": "A",
    "exactly-100": "a" * 100,
    "101-chars": "a" * 101,
    "100-after-padding": "  " + "a" * 100 + "\t",
    "101-after-padding": " " + "a" * 101 + " ",
    "99-plus-trailing-space": "a" * 99 + " ",
    "nbsp-wrapped": "\u00a0Team\u00a0",
    "internal-spaces-kept": "Team  Alpha",
    "accented-100": "é" * 100,
    "emoji-100": "😀" * 100,
    "emoji-101": "😀" * 101,
    "combining-100-codepoints": "e\u0301" * 50,
    "combining-101-codepoints": "e\u0301" * 50 + "x",
}


@pytest.mark.parametrize("schema_cls", NAME_SCHEMAS)
@pytest.mark.parametrize(("body", "expect"), _board_case_params("board_create"))
def test_property_1_name_matches_shared_fixture(schema_cls, body, expect):
    """Feature: boards-membership, Property 1: Board name rule (board-field-cases.json)."""
    loaded, exc = run_body(schema_cls, body)
    _assert_fixture_outcome(loaded, exc, expect, {"name"})


@pytest.mark.parametrize("schema_cls", NAME_SCHEMAS)
@pytest.mark.parametrize("value", list(NAME_VALUES.values()), ids=list(NAME_VALUES))
def test_property_1_name_accepted_iff_trimmed_length_is_1_to_100(schema_cls, value):
    """Feature: boards-membership, Property 1: Board name rule (boundary oracle)."""
    trimmed = value.strip()
    loaded, exc = run_body(schema_cls, {"name": value})
    if 1 <= len(trimmed) <= NAME_MAX:
        assert exc is None, exc.fields
        assert loaded == {"name": trimmed}
    else:
        assert loaded is None
        assert exc.fields == {"name": NAME_LENGTH}


# ---------------------------------------------------------------------------
# Property 2: Request schemas accept exactly their field set
# Feature: boards-membership, Property 2: Request schemas accept exactly their field set
# **Validates: Requirements 1.2, 3.4, 4.6**
# ---------------------------------------------------------------------------

REQUEST_SCHEMAS = [
    pytest.param(BoardCreateSchema, {"name"}, {"name": "Team Alpha"}, id="E06-board-create"),
    pytest.param(BoardUpdateSchema, {"name"}, {"name": "Team Alpha"}, id="E08-board-update"),
    pytest.param(MemberAddSchema, {"email"}, {"email": "ada@example.com"}, id="E11-member-add"),
]

# Keys a client could send to any request body. The keys a schema declares are not extras.
OTHER_KEYS = [
    "name",
    "email",
    "role",
    "id",
    "board_id",
    "creator_id",
    "password",
    "password_hash",
    "deleted_at",
    "position_version",
]


def _extra_key_params():
    params = []
    for schema_cls, fields, valid in (p.values for p in REQUEST_SCHEMAS):
        for extra in OTHER_KEYS:
            if extra not in fields:
                params.append(
                    pytest.param(
                        schema_cls, fields, valid, extra, id=f"{schema_cls.__name__}-{extra}"
                    )
                )
    return params


@pytest.mark.parametrize(("schema_cls", "fields", "valid"), REQUEST_SCHEMAS)
def test_property_2_declared_fields_are_exactly_the_contract(schema_cls, fields, valid):
    """Feature: boards-membership, Property 2: Request schemas accept exactly their field set."""
    schema = schema_cls()
    # E06 and E08 also declare the optional sprint pair (Revision 2, DS6).
    sprint = (
        {"sprint_start", "sprint_end"}
        if schema_cls in (BoardCreateSchema, BoardUpdateSchema)
        else set()
    )
    assert set(schema.fields) == fields | sprint
    assert schema.unknown == RAISE


@pytest.mark.parametrize(("schema_cls", "fields", "valid"), REQUEST_SCHEMAS)
def test_property_2_exact_key_set_is_accepted_and_returned(schema_cls, fields, valid):
    """Feature: boards-membership, Property 2: Request schemas accept exactly their field set."""
    loaded, exc = run_body(schema_cls, valid)
    assert exc is None, exc.fields
    assert set(loaded) == fields
    assert loaded == valid


@pytest.mark.parametrize(("schema_cls", "fields", "valid", "extra"), _extra_key_params())
def test_property_2_extra_key_is_rejected_with_its_name_in_fields(schema_cls, fields, valid, extra):
    """Feature: boards-membership, Property 2: Request schemas accept exactly their field set."""
    loaded, exc = run_body(schema_cls, {**valid, extra: "x"})
    assert loaded is None
    assert exc.status == 400
    assert exc.code == "VALIDATION_ERROR"
    assert exc.fields == {extra: UNKNOWN}


@pytest.mark.parametrize(("schema_cls", "fields", "valid"), REQUEST_SCHEMAS)
def test_property_2_every_extra_key_is_reported_together(schema_cls, fields, valid):
    """Feature: boards-membership, Property 2: Request schemas accept exactly their field set."""
    extras = {key: "x" for key in OTHER_KEYS if key not in fields}
    loaded, exc = run_body(schema_cls, {**valid, **extras})
    assert loaded is None
    assert exc.fields == {key: UNKNOWN for key in extras}


@pytest.mark.parametrize(("schema_cls", "fields", "valid"), REQUEST_SCHEMAS)
def test_property_2_missing_key_is_rejected_with_required_in_fields(schema_cls, fields, valid):
    """Feature: boards-membership, Property 2: Request schemas accept exactly their field set."""
    loaded, exc = run_body(schema_cls, {})
    assert loaded is None
    assert exc.status == 400
    assert exc.code == "VALIDATION_ERROR"
    assert exc.fields == {name: REQUIRED for name in fields}


@pytest.mark.parametrize(("schema_cls", "fields", "valid"), REQUEST_SCHEMAS)
def test_property_2_missing_and_extra_key_are_both_reported(schema_cls, fields, valid):
    """Feature: boards-membership, Property 2: Request schemas accept exactly their field set."""
    loaded, exc = run_body(schema_cls, {"role": "admin"})
    assert loaded is None
    assert exc.fields == {"role": UNKNOWN, **{name: REQUIRED for name in fields}}


# ---------------------------------------------------------------------------
# Property 3: Member email rule and normalization
# Feature: boards-membership, Property 3: Member email rule and normalization
# **Validates: Requirements 4.2, 4.6, 7.10, 7.11**
# ---------------------------------------------------------------------------

EMAIL_VALUES = {
    "empty": "",
    "spaces-only": "   ",
    "minimal": "a@b.co",
    "padded-mixed-case": "  Ada@Example.COM ",
    "tab-and-newline": "\tada@example.com\n",
    "ideographic-space": "\u3000ada@example.com",
    "exactly-254": "a" * 242 + "@example.com",
    "255-chars": "a" * 243 + "@example.com",
    "254-after-padding": "   " + "a" * 242 + "@example.com" + "   ",
    "no-at": "ada.example.com",
    "two-at": "a@b@c.com",
    "no-dot-in-domain": "ada@examplecom",
    "space-inside": "ada@exa mple.com",
    "nbsp-inside": "ada@exa\u00a0mple.com",
    "empty-local-part": "@example.com",
    "trailing-dot": "ada@example.",
    "dotted-local-and-tag": "first.last+tag@sub.example.co.uk",
    "unicode-local-part": "ünïcode@example.com",
    "lowercase-expands": "İ@example.com",
}


def expected_email(value):
    """Return (normalized value, None) when accepted, or (None, message) when rejected."""
    normalized = value.strip().lower()
    if len(normalized) > EMAIL_MAX:
        return None, EMAIL_LENGTH
    if not EMAIL_PATTERN.fullmatch(normalized):
        return None, EMAIL_FORMAT
    return normalized, None


@pytest.mark.parametrize(("body", "expect"), _board_case_params("member_add"))
def test_property_3_email_matches_shared_fixture(body, expect):
    """Feature: boards-membership, Property 3: Member email rule and normalization."""
    loaded, exc = run_body(MemberAddSchema, body)
    _assert_fixture_outcome(loaded, exc, expect, {"email"})


@pytest.mark.parametrize("value", list(EMAIL_VALUES.values()), ids=list(EMAIL_VALUES))
def test_property_3_accepted_iff_normalized_is_at_most_254_and_matches_pattern(value):
    """Feature: boards-membership, Property 3: Member email rule and normalization (oracle)."""
    normalized, message = expected_email(value)
    loaded, exc = run_body(MemberAddSchema, {"email": value})
    if message is None:
        assert exc is None, exc.fields
        assert loaded == {"email": normalized}
    else:
        assert loaded is None
        assert exc.fields == {"email": message}


REGISTER_OK = {"name": "Ada", "password": "Horse-4Bat"}


def _email_outcome(schema_cls, body):
    """Return the email result of one schema: the accepted value or the email message."""
    loaded, exc = run_body(schema_cls, body)
    if exc is None:
        return ("accepted", loaded["email"])
    return ("rejected", exc.fields["email"])


@pytest.mark.parametrize("value", list(EMAIL_VALUES.values()), ids=list(EMAIL_VALUES))
def test_property_3_auth_and_boards_give_the_same_email_result(value):
    """Feature: boards-membership, Property 3: Member email rule and normalization.

    The auth register schema and the boards E11 schema both use the email validators in
    `app.validation`, so they must accept the same values with the same normalized result and
    reject the same values with the same message.
    """
    register = _email_outcome(RegisterSchema, {**REGISTER_OK, "email": value})
    member = _email_outcome(MemberAddSchema, {"email": value})
    assert register == member


REGISTER_CASES = load_cases("register")[1]


@pytest.mark.parametrize("case_id", [case_id for case_id, _, _ in REGISTER_CASES])
def test_property_3_auth_and_boards_agree_on_every_register_email_case(case_id):
    """Feature: boards-membership, Property 3: Member email rule and normalization.

    Each case from auth-field-cases.json is sent to both schemas with only its email value.
    A case that has no email key sends no email to either schema.
    """
    case_body = next(body for cid, body, _ in REGISTER_CASES if cid == case_id)
    if "email" in case_body:
        register_body = {**REGISTER_OK, "email": case_body["email"]}
        member_body = {"email": case_body["email"]}
    else:
        register_body = dict(REGISTER_OK)
        member_body = {}
    assert _email_outcome(RegisterSchema, register_body) == _email_outcome(
        MemberAddSchema, member_body
    )
