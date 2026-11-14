"""AC12.1, Requirements 1.3 and 2.2–2.4: the profile field rules, run on the shared cases."""

import pytest
from marshmallow import ValidationError

from app.blueprints.auth.schema import RegisterSchema
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
    assert first_messages(excinfo.value.messages) == {"password": "Unknown field."}


def test_register_and_profile_share_the_field_message_map():
    assert RegisterSchema().fields["name"].error_messages["required"] == FIELD_MESSAGES["required"]
    assert ProfileUpdateSchema().fields["name"].error_messages["null"] == FIELD_MESSAGES["null"]


def test_messages_never_echo_the_submitted_value():
    sentinel = "leak-sentinel-value-4242"
    for body in (
        {"name": "", "email": sentinel, sentinel: sentinel},
        {"name": 5, "email": None},
        {"name": "a" * 81, "email": sentinel + "@" + "x" * 300},
    ):
        with pytest.raises(ValidationError) as excinfo:
            ProfileUpdateSchema().load(body)
        assert sentinel not in str(excinfo.value.messages).replace(f"'{sentinel}':", "")
