"""Refuse to run the test suite against a database that could hold real data (FND-AC8.1).

The migration tests drop and rebuild the `revotask` schema, so a wrong URL would be destructive.
Error messages name the rule and never include a URL, because a URL can carry a password.
"""

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

LOCAL_HOSTS = frozenset({"", "localhost", "127.0.0.1", "::1"})
TEST_DATABASE_SUFFIX = "_test"


class UnsafeTestDatabaseError(RuntimeError):
    """The test database setting is missing, malformed or unsafe."""


def assert_safe_test_database(test_url: str | None, app_url: str | None) -> None:
    if not test_url or not test_url.strip():
        raise UnsafeTestDatabaseError("TEST_DATABASE_URL: a value is required to run tests.")
    try:
        test = make_url(test_url)
    except ArgumentError:
        raise UnsafeTestDatabaseError("TEST_DATABASE_URL: not a valid SQLAlchemy URL.") from None

    if app_url:
        app = make_url(app_url)
        # Compare the target, not the spelling. The same database under another password or
        # driver name is still the same database.
        if (test.host, test.port, test.database) == (app.host, app.port, app.database):
            raise UnsafeTestDatabaseError(
                "TEST_DATABASE_URL: points at the same database as DATABASE_URL."
            )

    if not (test.database or "").endswith(TEST_DATABASE_SUFFIX):
        raise UnsafeTestDatabaseError(
            f"TEST_DATABASE_URL: the database name must end in {TEST_DATABASE_SUFFIX}."
        )
    if (test.host or "") not in LOCAL_HOSTS:
        raise UnsafeTestDatabaseError("TEST_DATABASE_URL: the host must be local.")
