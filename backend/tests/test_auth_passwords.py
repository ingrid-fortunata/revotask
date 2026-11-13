"""AUTH-AC1.2, AUTH-AC2.3: Argon2id hashing, verification and the dummy check."""

import time

from app.blueprints.auth import service
from app.blueprints.auth.service import hash_password, verify_dummy, verify_password


def test_hash_is_argon2id_and_does_not_contain_the_password():
    password = "correct horse battery staple"
    hashed = hash_password(password)
    assert hashed.startswith("$argon2id$")
    assert password not in hashed


def test_same_password_hashes_differently_each_time():
    assert hash_password("same password 123") != hash_password("same password 123")


def test_verify_accepts_the_right_password_and_rejects_others():
    hashed = hash_password("right password 123")
    assert verify_password(hashed, "right password 123") is True
    assert verify_password(hashed, "wrong password 123") is False
    assert verify_password(hashed, "") is False


def test_password_whitespace_is_significant():
    hashed = hash_password(" spaced password ")
    assert verify_password(hashed, " spaced password ") is True
    assert verify_password(hashed, "spaced password") is False


def test_invalid_stored_hash_returns_false_and_does_not_raise():
    for bad in ("", "not-a-hash", "$argon2id$placeholder-not-a-real-hash"):
        assert verify_password(bad, "anything") is False


def test_verify_dummy_runs_a_real_verification(monkeypatch):
    calls = []
    original = service.verify_password
    monkeypatch.setattr(service, "verify_password", lambda h, p: calls.append(h) or original(h, p))
    verify_dummy("some password")
    assert len(calls) == 1
    assert calls[0].startswith("$argon2id$")


def test_dummy_check_costs_about_as_much_as_a_real_check():
    hashed = hash_password("timing password 123")
    verify_dummy("warm up")
    start = time.perf_counter()
    verify_password(hashed, "wrong password")
    real = time.perf_counter() - start
    start = time.perf_counter()
    verify_dummy("wrong password")
    dummy = time.perf_counter() - start
    # Same algorithm and parameters, so the two stay within a factor of three of each other.
    assert dummy < real * 3 and real < dummy * 3
