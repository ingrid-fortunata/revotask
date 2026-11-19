"""AC12.1, Requirements 1.3 and 2.2–2.5: the profile field rules on the shared cases (Rev 2)."""

import pytest
from marshmallow import ValidationError

from app.blueprints.auth.schema import LoginSchema, RegisterSchema
from app.blueprints.users.schema import ProfileUpdateSchema
from app.validation import FIELD_MESSAGES, first_messages
from tests.auth_cases import load_cases

_BASE, _CASES = load_cases("profile")


@pytest.mark.parametrize(("body", "expect"), [pytest.param(b, e, id=i) for i, b, e in _CASES])
def test_profile_shared_cases(body, expect):
    try:
        loaded, fields = ProfileUpdateSchema().load(body), None
    except ValidationError as exc:
        loaded, fields = None, first_messages(exc.messages)
    if "fields" in expect:
        assert loaded is None, "expected the schema to reject this body"
        assert fields == expect["fields"]
    else:
        assert fields is None, fields
        assert set(loaded) == set(body)
        for name, value in expect["accepted"].items():
            assert loaded[name] == value


def test_every_profile_case_has_a_unique_id():
    ids = [case_id for case_id, _, _ in _CASES]
    assert len(ids) == len(set(ids))


def test_an_unknown_key_beside_valid_fields_reports_only_the_unknown_key():
    with pytest.raises(ValidationError) as excinfo:
        ProfileUpdateSchema().load({"name": "Ada", "email": "a@b.co", "password": "x"})
    assert first_messages(excinfo.value.messages) == {
        "email": "Unknown field.",
        "password": "Unknown field.",
    }


def test_the_email_is_not_a_declared_field():
    assert "email" not in ProfileUpdateSchema().fields


def test_register_and_profile_share_the_field_message_map():
    assert RegisterSchema().fields["name"].error_messages["required"] == FIELD_MESSAGES["required"]
    assert ProfileUpdateSchema().fields["name"].error_messages["null"] == FIELD_MESSAGES["null"]
    for key in ("current_password", "new_password"):
        assert ProfileUpdateSchema().fields[key].error_messages["null"] == FIELD_MESSAGES["null"]


def _first_message(schema_cls, key, value):
    try:
        schema_cls().load({key: value}, partial=True)
    except ValidationError as exc:
        return first_messages(exc.messages).get(key)
    return None


@pytest.mark.parametrize(
    ("profile_key", "other_schema"),
    [("new_password", RegisterSchema), ("current_password", LoginSchema)],
)
def test_password_rules_are_the_register_and_login_rules(profile_key, other_schema):
    """The same validators, so a password boundary cannot drift between the forms (P17)."""
    for value in ("", "a", "Aa1!aaa", "Aa1!aaaa", "Aa1!aaaaaa", "Aa1!aaaaaaa", "aa1!aaaa", "   "):
        assert _first_message(ProfileUpdateSchema, profile_key, value) == _first_message(
            other_schema, "password", value
        )


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"current_password": "Old#pass1"}, id="current-only"),
        pytest.param({"new_password": "New#pass2"}, id="new-only"),
        pytest.param({"name": "Ada", "new_password": "New#pass2"}, id="new-beside-name"),
        pytest.param({"current_password": "x" * 11}, id="present-half-invalid"),
    ],
)
def test_a_half_pair_reports_required_on_the_missing_key(body):
    missing = "new_password" if "new_password" not in body else "current_password"
    with pytest.raises(ValidationError) as excinfo:
        ProfileUpdateSchema().load(body)
    assert first_messages(excinfo.value.messages)[missing] == "Required."


def test_a_full_pair_loads_both_keys_untrimmed():
    loaded = ProfileUpdateSchema().load(
        {"current_password": " Old#p1 ", "new_password": " New#p2a "}
    )
    assert loaded == {"current_password": " Old#p1 ", "new_password": " New#p2a "}


def test_messages_never_echo_the_submitted_value():
    sentinel = "leak-sentinel-value-4242"
    for body in (
        {"name": "", "email": sentinel, sentinel: sentinel},
        {"name": 5, "new_password": None},
        {"name": "a" * 81, "current_password": sentinel, "new_password": sentinel},
        {"current_password": sentinel * 3, "new_password": sentinel.lower()},
        {"password": sentinel},
    ):
        with pytest.raises(ValidationError) as excinfo:
            ProfileUpdateSchema().load(body)
        assert sentinel not in str(excinfo.value.messages).replace(f"'{sentinel}':", "")
