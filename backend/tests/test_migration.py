"""FND-AC5.2, FND-AC5.6, FND-AC5.7: the first revision upgrades, reverses and re-applies cleanly.

Each test starts from an empty `revotask` schema on the guarded test database (marker `migration`),
and a finalizer restores head so later tests see the full schema.
"""

from pathlib import Path

import pytest
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

from app import create_app
from app.config import DB_SCHEMA

JWT_TEST_SECRET = "migration-test-secret-0123456789abcdef"
BACKEND_DIR = Path(__file__).resolve().parents[1]
NINE_TABLES = {
    "users",
    "boards",
    "board_members",
    "board_columns",
    "cards",
    "card_comments",
    "notifications",
    "board_events",
    "revoked_tokens",
}

pytestmark = pytest.mark.migration


def _run(engine_url, sql_statements):
    engine = create_engine(engine_url)
    try:
        with engine.begin() as conn:
            for statement in sql_statements:
                conn.execute(text(statement))
    finally:
        engine.dispose()


def _query_scalar(url, sql):
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return conn.execute(text(sql)).scalar()
    finally:
        engine.dispose()


def _revotask_tables(url):
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'revotask' ORDER BY 1"
                )
            ).all()
            return {row[0] for row in rows}
    finally:
        engine.dispose()


def _make_app(url):
    return create_app(
        {
            "APP_ENV": "test",
            "DATABASE_URL": url,
            "JWT_SECRET_KEY": JWT_TEST_SECRET,
            "LOG_LEVEL": "WARNING",
        }
    )


@pytest.fixture
def migration_app(test_db_url):
    """Reset to an empty schema, then bootstrap. Restore head afterwards for later tests."""
    _run(test_db_url, [f"DROP SCHEMA IF EXISTS {DB_SCHEMA} CASCADE"])
    app = _make_app(test_db_url)
    result = app.test_cli_runner().invoke(args=["bootstrap-schema"])
    assert result.exit_code == 0, result.output
    yield app
    _run(test_db_url, [f"DROP SCHEMA IF EXISTS {DB_SCHEMA} CASCADE"])
    restore = _make_app(test_db_url).test_cli_runner()
    restore.invoke(args=["bootstrap-schema"])
    assert restore.invoke(args=["db", "upgrade"]).exit_code == 0


def _cli(app, *args):
    result = app.test_cli_runner().invoke(args=list(args))
    assert result.exit_code == 0, result.output
    return result


def test_upgrade_creates_the_nine_tables_and_the_version_table(migration_app, test_db_url):
    _cli(migration_app, "db", "upgrade")
    assert _revotask_tables(test_db_url) == NINE_TABLES | {"alembic_version"}


def test_current_revision_is_the_single_head(migration_app, test_db_url):
    _cli(migration_app, "db", "upgrade")
    head = ScriptDirectory(str(BACKEND_DIR / "migrations")).get_current_head()
    engine = create_engine(test_db_url)
    try:
        with engine.connect() as conn:
            # The same read  performs, without parsing printed output.
            context = MigrationContext.configure(conn, opts={"version_table_schema": DB_SCHEMA})
            assert context.get_current_revision() == head
    finally:
        engine.dispose()


def test_second_upgrade_is_a_no_op(migration_app, test_db_url):
    _cli(migration_app, "db", "upgrade")
    before = _revotask_tables(test_db_url)
    _cli(migration_app, "db", "upgrade")
    assert _revotask_tables(test_db_url) == before


def test_downgrade_base_removes_every_table_but_keeps_schema_and_empty_version_table(
    migration_app, test_db_url
):
    _cli(migration_app, "db", "upgrade")
    _cli(migration_app, "db", "downgrade", "base")

    assert (
        _query_scalar(test_db_url, "SELECT count(*) FROM pg_namespace WHERE nspname = 'revotask'")
        == 1
    )
    assert _revotask_tables(test_db_url) == {"alembic_version"}
    assert _query_scalar(test_db_url, f"SELECT count(*) FROM {DB_SCHEMA}.alembic_version") == 0


def test_reupgrade_after_downgrade_succeeds(migration_app, test_db_url):
    _cli(migration_app, "db", "upgrade")
    _cli(migration_app, "db", "downgrade", "base")
    _cli(migration_app, "db", "upgrade")
    assert _revotask_tables(test_db_url) == NINE_TABLES | {"alembic_version"}


def test_autogenerate_reports_no_drift_after_upgrade(migration_app, test_db_url):
    """FND-AC5.7: a migrate run on the upgraded schema writes no revision."""
    _cli(migration_app, "db", "upgrade")
    versions = BACKEND_DIR / "migrations" / "versions"
    before = {p.name for p in versions.glob("*.py")}

    result = migration_app.test_cli_runner().invoke(
        args=["db", "migrate", "-m", "drift-check-test"]
    )
    assert result.exit_code == 0, result.output
    assert "No changes in schema detected." in result.output
    assert {p.name for p in versions.glob("*.py")} == before
