"""FND-AC5.1, FND-AC5.8 (bootstrap part): create-if-missing, idempotent, no URL in errors.

These tests drop the revotask schema on the guarded test database. Marker `migration`.
"""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

from app import create_app
from app.cli import ensure_schema

JWT_TEST_SECRET = "bootstrap-test-secret-0123456789abcdef"

pytestmark = pytest.mark.migration


class _FakeOrig:
    def __init__(self, sqlstate):
        self.sqlstate = sqlstate


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def first(self):
        return self._value


class _RaceLosingConnection:
    """Report no schema, then fail CREATE with duplicate_schema, as a winning rival would."""

    def execute(self, statement, params=None):
        if "pg_namespace" in str(statement):
            return _FakeResult(None)
        raise ProgrammingError("CREATE SCHEMA revotask", {}, _FakeOrig("42P06"))


class _RaceLosingEngine:
    class _Begin:
        def __enter__(self):
            return _RaceLosingConnection()

        def __exit__(self, *exc_info):
            return False

    def begin(self):
        return self._Begin()


def _schema_exists(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return (
                conn.execute(text("SELECT 1 FROM pg_namespace WHERE nspname = 'revotask'")).first()
                is not None
            )
    finally:
        engine.dispose()


def _drop_schema(url: str) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA IF EXISTS revotask CASCADE"))
    finally:
        engine.dispose()


@pytest.fixture
def empty_test_database(test_db_url):
    """Start from no revotask schema on the guarded test database."""
    _drop_schema(test_db_url)
    yield test_db_url
    _drop_schema(test_db_url)


@pytest.fixture
def test_app(empty_test_database):
    return create_app(
        {
            "APP_ENV": "test",
            "DATABASE_URL": empty_test_database,
            "JWT_SECRET_KEY": JWT_TEST_SECRET,
            "LOG_LEVEL": "WARNING",
        }
    )


def test_creates_the_schema_when_missing(test_app, empty_test_database):
    result = test_app.test_cli_runner().invoke(args=["bootstrap-schema"])
    assert result.exit_code == 0, result.output
    assert "Created schema 'revotask'." in result.output
    assert _schema_exists(empty_test_database)


def test_second_run_changes_nothing_and_keeps_existing_objects(test_app, empty_test_database):
    runner = test_app.test_cli_runner()
    assert runner.invoke(args=["bootstrap-schema"]).exit_code == 0

    engine = create_engine(empty_test_database)
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE revotask.bootstrap_marker (id int)"))
            conn.execute(text("INSERT INTO revotask.bootstrap_marker VALUES (7)"))

        result = runner.invoke(args=["bootstrap-schema"])
        assert result.exit_code == 0, result.output
        assert "already exists; nothing to do." in result.output

        with engine.connect() as conn:
            assert conn.execute(text("SELECT id FROM revotask.bootstrap_marker")).scalar() == 7
    finally:
        engine.dispose()


def test_ensure_schema_returns_false_when_the_schema_already_exists(empty_test_database):
    engine = create_engine(empty_test_database)
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE SCHEMA revotask"))
        assert ensure_schema(engine) is False
    finally:
        engine.dispose()


def test_duplicate_schema_from_a_concurrent_creator_counts_as_success():
    assert ensure_schema(_RaceLosingEngine()) is False


def test_unreachable_database_message_has_no_url_or_password(caplog):
    app = create_app(
        {
            "APP_ENV": "test",
            "DATABASE_URL": "postgresql+psycopg://revotask:bootstrap-pw-sentinel@127.0.0.1:1/x_test",
            "JWT_SECRET_KEY": JWT_TEST_SECRET,
            "LOG_LEVEL": "WARNING",
        }
    )
    result = app.test_cli_runner().invoke(args=["bootstrap-schema"])
    assert result.exit_code != 0
    assert "Cannot reach the database." in result.output
    combined = result.output + "".join(r.getMessage() for r in caplog.records)
    assert "bootstrap-pw-sentinel" not in combined
    assert "127.0.0.1" not in combined


def test_permission_denied_maps_to_a_clear_message(monkeypatch):
    app = create_app(
        {
            "APP_ENV": "test",
            "DATABASE_URL": "postgresql+psycopg://revotask:x@127.0.0.1:1/x_test",
            "JWT_SECRET_KEY": JWT_TEST_SECRET,
            "LOG_LEVEL": "WARNING",
        }
    )

    def deny(_engine):
        raise ProgrammingError("CREATE SCHEMA revotask", {}, _FakeOrig("42501"))

    monkeypatch.setattr("app.cli.ensure_schema", deny)
    result = app.test_cli_runner().invoke(args=["bootstrap-schema"])
    assert result.exit_code != 0
    assert "Not permitted to create schema 'revotask'." in result.output


def test_db_upgrade_without_the_schema_fails_and_creates_nothing(test_app, empty_test_database):
    """FND-AC5.3 (DB06): migrations stop before any DDL and point to bootstrap-schema."""
    result = test_app.test_cli_runner().invoke(args=["db", "upgrade"])
    assert result.exit_code != 0
    assert "does not exist" in result.output
    assert "bootstrap-schema" in result.output
    assert not _schema_exists(empty_test_database)


def test_db_upgrade_against_an_unreachable_database_hides_the_url(caplog):
    """FND-AC5.8: connection failures exit non-zero without printing the URL or password."""
    app = create_app(
        {
            "APP_ENV": "test",
            "DATABASE_URL": "postgresql+psycopg://revotask:upgrade-pw-sentinel@127.0.0.1:1/x_test",
            "JWT_SECRET_KEY": JWT_TEST_SECRET,
            "LOG_LEVEL": "WARNING",
        }
    )
    result = app.test_cli_runner().invoke(args=["db", "upgrade"])
    assert result.exit_code != 0
    assert "Cannot reach the database." in result.output
    combined = result.output + "".join(r.getMessage() for r in caplog.records)
    assert "upgrade-pw-sentinel" not in combined
    assert "127.0.0.1" not in combined
