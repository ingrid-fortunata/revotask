"""`flask bootstrap-schema`: create the revotask schema when it is missing (FND-AC5.1, FND-AC5.8).

The command never drops or alters an existing schema. Migrations need the schema to exist first,
because the Alembic version table lives inside it (design DD2, DD3).
"""

from __future__ import annotations

import logging

import click
from flask.cli import with_appcontext
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import DBAPIError, OperationalError, SQLAlchemyError

from app.config import DB_SCHEMA
from app.extensions import db

logger = logging.getLogger("revotask.cli")

INSUFFICIENT_PRIVILEGE = "42501"
DUPLICATE_SCHEMA = "42P06"


def ensure_schema(engine: Engine) -> bool:
    """Create the schema if it is missing. Return True when this call created it."""
    try:
        with engine.begin() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_namespace WHERE nspname = :name"), {"name": DB_SCHEMA}
            ).first()
            if exists is not None:
                return False
            # DB_SCHEMA is a module constant, never user input, so it is safe to inline.
            conn.execute(text(f"CREATE SCHEMA {DB_SCHEMA}"))
            return True
    except DBAPIError as exc:
        # Another process created the schema between the check and the CREATE. That is success.
        if _sqlstate(exc) == DUPLICATE_SCHEMA:
            return False
        raise


def _sqlstate(exc: DBAPIError) -> str | None:
    return getattr(exc.orig, "sqlstate", None)


@click.command("bootstrap-schema")
@with_appcontext
def bootstrap_schema_command() -> None:
    try:
        created = ensure_schema(db.engine)
    except OperationalError:
        # Log the class name only. Driver messages can include the host.
        logger.error("bootstrap_schema_failed error_class=OperationalError")
        raise click.ClickException("Cannot reach the database.") from None
    except DBAPIError as exc:
        if _sqlstate(exc) == INSUFFICIENT_PRIVILEGE:
            raise click.ClickException(f"Not permitted to create schema '{DB_SCHEMA}'.") from None
        logger.error("bootstrap_schema_failed error_class=%s", type(exc).__name__)
        raise click.ClickException("Schema bootstrap failed.") from None
    except SQLAlchemyError as exc:
        logger.error("bootstrap_schema_failed error_class=%s", type(exc).__name__)
        raise click.ClickException("Schema bootstrap failed.") from None

    if created:
        click.echo(f"Created schema '{DB_SCHEMA}'.")
    else:
        click.echo(f"Schema '{DB_SCHEMA}' already exists; nothing to do.")
