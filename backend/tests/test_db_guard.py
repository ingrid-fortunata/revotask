"""FND-AC8.1: the guard refuses unsafe test database URLs and never echoes them."""

import pytest

from tests.db_guard import UnsafeTestDatabaseError, assert_safe_test_database

APP = "postgresql+psycopg://revotask:guard-pw-sentinel@127.0.0.1:5432/revotask_dev"
GOOD = "postgresql+psycopg://revotask:guard-pw-sentinel@127.0.0.1:5432/revotask_test"


def test_valid_local_test_database_passes():
    assert_safe_test_database(GOOD, APP)


@pytest.mark.parametrize("host", ["localhost", "[::1]"])
def test_other_local_host_spellings_pass(host):
    url = f"postgresql+psycopg://revotask:pw@{host}:5432/revotask_test"
    assert_safe_test_database(url, APP)


def test_unix_socket_without_host_passes():
    assert_safe_test_database("postgresql+psycopg://revotask:pw@/revotask_test", APP)


def test_identical_url_is_refused():
    with pytest.raises(UnsafeTestDatabaseError, match="same database"):
        assert_safe_test_database(APP, APP)


def test_same_database_with_a_different_password_is_refused():
    other_password = APP.replace("guard-pw-sentinel", "different-pw")
    with pytest.raises(UnsafeTestDatabaseError, match="same database"):
        assert_safe_test_database(other_password, APP)


def test_database_name_without_test_suffix_is_refused():
    url = GOOD.replace("revotask_test", "revotask_dev")
    with pytest.raises(UnsafeTestDatabaseError, match="must end in _test"):
        assert_safe_test_database(url, APP.replace("revotask_dev", "other_db"))


def test_remote_host_is_refused():
    url = "postgresql+psycopg://revotask:pw@db.example.com:5432/revotask_test"
    with pytest.raises(UnsafeTestDatabaseError, match="must be local"):
        assert_safe_test_database(url, APP)


@pytest.mark.parametrize("missing", [None, "", "   "])
def test_missing_test_url_is_refused(missing):
    with pytest.raises(UnsafeTestDatabaseError, match="a value is required"):
        assert_safe_test_database(missing, APP)


def test_malformed_test_url_is_refused_without_echoing_it():
    bad = "not a url guard-pw-sentinel"
    with pytest.raises(UnsafeTestDatabaseError) as info:
        assert_safe_test_database(bad, APP)
    assert "not a valid SQLAlchemy URL" in str(info.value)
    assert "guard-pw-sentinel" not in str(info.value)


@pytest.mark.parametrize(
    "bad_url",
    [
        "postgresql+psycopg://revotask:guard-pw-sentinel@db.example.com/revotask_dev",
        "postgresql+psycopg://revotask:guard-pw-sentinel@127.0.0.1/revotask_dev",
    ],
)
def test_failure_messages_do_not_include_any_url_or_password(bad_url):
    with pytest.raises(UnsafeTestDatabaseError) as info:
        assert_safe_test_database(bad_url, APP)
    message = str(info.value)
    assert "guard-pw-sentinel" not in message
    assert "127.0.0.1" not in message and "db.example.com" not in message
