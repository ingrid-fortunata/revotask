"""Shared pytest fixtures. Data tests use a rolled-back session on the guarded test database."""

import os
from pathlib import Path

import pytest
from dotenv import dotenv_values
from sqlalchemy.orm import Session

from app import create_app
from app.extensions import db
from tests.db_guard import assert_safe_test_database

BACKEND_DIR = Path(__file__).resolve().parents[1]
JWT_TEST_SECRET = "conftest-only-secret-0123456789abcdef"


def _setting(name: str) -> str | None:
    """Read a setting from the process environment first, then from backend/.env."""
    return os.environ.get(name) or dotenv_values(BACKEND_DIR / ".env").get(name)


@pytest.fixture(scope="session")
def test_db_url() -> str:
    url = _setting("TEST_DATABASE_URL")
    assert_safe_test_database(url, _setting("DATABASE_URL"))
    return url


@pytest.fixture(scope="session")
def app(test_db_url):
    return create_app(
        {
            "APP_ENV": "test",
            "DATABASE_URL": test_db_url,
            "JWT_SECRET_KEY": JWT_TEST_SECRET,
            "LOG_LEVEL": "WARNING",
        }
    )


@pytest.fixture
def schema_at_head(app):
    """Build the schema through the same code path as the CLI (FND-AC8.2).

    Creates the schema when missing, then applies Alembic revisions to head. The test
    suite never calls create_all. The check runs for every test (one query when the schema
    is already at head), because the migration tests drop and rebuild the schema and a
    once-per-session setup would leave later tests without it.
    """
    from alembic.script import ScriptDirectory
    from flask_migrate import upgrade
    from sqlalchemy import text
    from sqlalchemy.exc import ProgrammingError

    from app.cli import ensure_schema
    from app.extensions import db

    head = ScriptDirectory(str(BACKEND_DIR / "migrations")).get_current_head()
    with app.app_context():
        try:
            with db.engine.connect() as connection:
                current = connection.execute(
                    text("SELECT version_num FROM revotask.alembic_version")
                ).scalar()
        except ProgrammingError:
            current = None
        if current != head:
            ensure_schema(db.engine)
            upgrade(directory=str(BACKEND_DIR / "migrations"))


@pytest.fixture
def db_session(app, schema_at_head):
    """A session inside an outer transaction. Each test rolls back, so data never persists."""
    with app.app_context():
        connection = db.engine.connect()
        transaction = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()
            connection.close()
