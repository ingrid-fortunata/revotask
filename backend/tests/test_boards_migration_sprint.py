"""Revision 2 (P19, 8.16): the sprint columns and `ck_boards_sprint_range_valid`.

The constraint tests run first, on the schema at head, in a rolled-back transaction. The migration
tests then rebuild the schema (marker `migration`) and restore head in the shared fixture.
"""

import uuid
from datetime import date

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from tests.test_db_constraints import make_user
from tests.test_migration import _cli, _query_scalar, migration_app  # noqa: F401

PREVIOUS_REVISION = "a265fb5e7047"
SPRINT_COLUMNS_SQL = (
    "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'revotask' "
    "AND table_name = 'boards' AND column_name IN ('sprint_start', 'sprint_end')"
)


def _insert(session, start, end):
    session.execute(
        text(
            "INSERT INTO revotask.boards (id, creator_id, name, sprint_start, sprint_end) "
            "VALUES (:id, :creator, 'Sprint', :start, :end)"
        ),
        {"id": uuid.uuid4(), "creator": make_user(session), "start": start, "end": end},
    )


@pytest.mark.usefixtures("schema_at_head")
@pytest.mark.parametrize(
    ("start", "end"),
    [
        (None, None),
        (date(2026, 11, 16), date(2026, 11, 16)),  # one day
        (date(2026, 11, 16), date(2026, 11, 22)),
        (date(2026, 11, 1), date.fromordinal(date(2026, 11, 1).toordinal() + 89)),  # 90 days
        (date(2028, 2, 29), date(2028, 3, 1)),  # leap day
    ],
)
def test_valid_ranges_are_accepted(db_session, start, end):
    _insert(db_session, start, end)


@pytest.mark.usefixtures("schema_at_head")
@pytest.mark.parametrize(
    ("start", "end"),
    [
        (date(2026, 11, 16), None),
        (None, date(2026, 11, 22)),
        (date(2026, 11, 22), date(2026, 11, 16)),  # end before start
        (date(2026, 11, 1), date.fromordinal(date(2026, 11, 1).toordinal() + 90)),  # 91 days
    ],
)
def test_invalid_ranges_fail_on_the_constraint(db_session, start, end):
    with pytest.raises(IntegrityError) as info:
        with db_session.begin_nested():
            _insert(db_session, start, end)
    assert info.value.orig.diag.constraint_name == "ck_boards_sprint_range_valid"


@pytest.mark.migration
def test_boards_before_the_upgrade_keep_both_columns_null(migration_app, test_db_url):  # noqa: F811
    _cli(migration_app, "db", "upgrade", PREVIOUS_REVISION)
    assert _query_scalar(test_db_url, SPRINT_COLUMNS_SQL) == 0
    engine = create_engine(test_db_url)
    try:
        with engine.begin() as conn:
            user = uuid.uuid4()
            conn.execute(
                text(
                    "INSERT INTO revotask.users (id, name, email, password_hash) "
                    "VALUES (:id, 'Ann', 'sprint-old@example.com', 'hash')"
                ),
                {"id": user},
            )
            conn.execute(
                text(
                    "INSERT INTO revotask.boards (id, creator_id, name) "
                    "VALUES (:id, :creator, 'Old')"
                ),
                {"id": uuid.uuid4(), "creator": user},
            )
    finally:
        engine.dispose()

    _cli(migration_app, "db", "upgrade")
    assert _query_scalar(test_db_url, SPRINT_COLUMNS_SQL) == 2
    assert (
        _query_scalar(
            test_db_url,
            "SELECT count(*) FROM revotask.boards "
            "WHERE sprint_start IS NULL AND sprint_end IS NULL",
        )
        == 1
    )


@pytest.mark.migration
def test_downgrade_one_step_removes_the_columns_and_the_constraint(migration_app, test_db_url):  # noqa: F811
    _cli(migration_app, "db", "upgrade")
    _cli(migration_app, "db", "downgrade", PREVIOUS_REVISION)
    assert _query_scalar(test_db_url, SPRINT_COLUMNS_SQL) == 0
    assert (
        _query_scalar(
            test_db_url,
            "SELECT count(*) FROM pg_constraint WHERE conname = 'ck_boards_sprint_range_valid'",
        )
        == 0
    )
    _cli(migration_app, "db", "upgrade")
    assert _query_scalar(test_db_url, SPRINT_COLUMNS_SQL) == 2
