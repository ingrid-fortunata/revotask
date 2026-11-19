"""AUTH-AC1.3, AUTH-AC2.4, AUTH-AC5.1: auth field rules, run on the cases shared with the UI."""

import uuid

import pytest
from marshmallow import ValidationError

from app.blueprints.auth.schema import LoginSchema, RegisterSchema, normalize_email
from app.blueprints.users.schema import PublicUserSchema
from app.validation import first_messages
from tests.auth_cases import load_cases

SCHEMAS = {"register": RegisterSchema, "login": LoginSchema}


def _params(form):
    _, cases = load_cases(form)
    return [pytest.param(body, expect, id=case_id) for case_id, body, expect in cases]


def _run(form, body):
    try:
        return SCHEMAS[form]().load(body), None
    except ValidationError as exc:
        return None, first_messages(exc.messages)


@pytest.mark.parametrize(("body", "expect"), _params("register"))
def test_register_shared_cases(body, expect):
    loaded, fields = _run("register", body)
    _assert_expectation(loaded, fields, expect, {"name", "email", "password"})


@pytest.mark.parametrize(("body", "expect"), _params("login"))
def test_login_shared_cases(body, expect):
    loaded, fields = _run("login", body)
    _assert_expectation(loaded, fields, expect, {"email", "password"})


def _assert_expectation(loaded, fields, expect, keys):
    if "fields" in expect:
        assert loaded is None, "expected the schema to reject this body"
        assert fields == expect["fields"]
    else:
        assert fields is None, fields
        assert set(loaded) == keys
        for name, value in expect["accepted"].items():
            assert loaded[name] == value


def test_every_shared_case_file_entry_has_a_unique_id():
    for form in SCHEMAS:
        ids = [case_id for case_id, _, _ in load_cases(form)[1]]
        assert len(ids) == len(set(ids))


def test_messages_never_echo_the_submitted_value():
    sentinel = "leak-sentinel-value-4242"
    for schema, body in (
        (RegisterSchema, {"name": "", "email": sentinel, "password": sentinel, "x": sentinel}),
        (LoginSchema, {"email": 7, "password": sentinel * 20, "x": sentinel}),
    ):
        with pytest.raises(ValidationError) as caught:
            schema().load(body)
        assert sentinel not in str(first_messages(caught.value.messages))


def test_password_is_kept_exactly_as_entered():
    body = {"name": "Ada", "email": "ada@example.com", "password": " Sp 1!aB "}
    assert RegisterSchema().load(body)["password"] == body["password"]
    assert (
        LoginSchema().load({"email": "a@b.co", "password": body["password"]})["password"]
        == (body["password"])
    )


def test_normalize_email_trims_and_lowercases():
    assert normalize_email("  Ada@Example.COM\t") == "ada@example.com"


def test_register_and_login_normalize_email_the_same_way():
    raw = "  MiXed@Case.Example  "
    reg = RegisterSchema().load({"name": "A", "email": raw, "password": "Xxxxxxx1!"})["email"]
    log = LoginSchema().load({"email": raw, "password": "x"})["email"]
    assert reg == log == normalize_email(raw)


def test_public_user_schema_dumps_exactly_id_name_and_email():
    class Row:
        id = uuid.uuid4()
        name = "Ada"
        email = "ada@example.com"
        password_hash = "$argon2id$secret"
        created_at = "2024-01-01"
        extra = "nope"

    dumped = PublicUserSchema().dump(Row())
    assert set(dumped) == {"id", "name", "email"}
    assert dumped == {"id": str(Row.id), "name": "Ada", "email": "ada@example.com"}


ASCII_PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"


@pytest.mark.parametrize("special", list(ASCII_PUNCTUATION))
def test_every_ascii_punctuation_character_counts_as_special(special):
    body = {"name": "Ada", "email": "ada@example.com", "password": f"Aa1{special}aaaa"}
    assert RegisterSchema().load(body)["password"] == body["password"]


def test_space_and_non_ascii_symbols_do_not_count_as_special():
    for filler in (" ", "€", "é", "😀"):
        with pytest.raises(ValidationError) as caught:
            RegisterSchema().load(
                {"name": "Ada", "email": "a@b.co", "password": f"Aa1{filler}aaaa"}
            )
        assert caught.value.messages == {
            "password": [
                "Must include an uppercase letter, a lowercase letter and a special character."
            ]
        }


def test_password_length_message_comes_first_when_both_rules_fail():
    with pytest.raises(ValidationError) as caught:
        RegisterSchema().load({"name": "Ada", "email": "a@b.co", "password": "abc"})
    fields = first_messages(caught.value.messages)
    assert fields == {"password": "Must be 8 to 10 characters."}
