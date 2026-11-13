"""Database readiness check with bounded time (FND-AC7.1–7.3, DD8).

The check opens a pooled connection and runs one read inside a transaction whose statement timeout
is set with set_config. It writes nothing. Driver messages are never returned, because they can
contain host names.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.exceptions import ServiceUnavailableError

logger = logging.getLogger("revotask.health")


def check_database(engine: Engine, *, statement_timeout_ms: int, probe_sql: str = "SELECT 1"):
    """Raise ServiceUnavailableError when the database cannot answer within the bound."""
    try:
        with engine.connect() as conn, conn.begin():
            conn.execute(
                text("SELECT set_config('statement_timeout', :ms, true)"),
                {"ms": str(statement_timeout_ms)},
            )
            conn.execute(text(probe_sql))
    except SQLAlchemyError as exc:
        # Includes pool timeouts. Log the class name only.
        logger.warning("health_check_failed error_class=%s", type(exc).__name__)
        raise ServiceUnavailableError() from None
