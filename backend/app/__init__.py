"""Flask application factory for the RevoTask API (BE01).

Feature Blueprints are registered here as their tasks land. The factory opens
no database connection, so importing or creating the app works without a
running database.
"""

from __future__ import annotations

from collections.abc import Mapping

from flask import Flask

from app.blueprints.health import health_bp
from app.cli import bootstrap_schema_command
from app.config import (
    DB_CONNECT_TIMEOUT_SECONDS,
    DB_POOL_TIMEOUT_SECONDS,
    DB_SCHEMA,
    Settings,
)
from app.errors import register_error_handlers
from app.extensions import db, jwt, migrate
from app.request_context import register_request_context


def create_app(env: Mapping[str, str] | None = None) -> Flask:
    """Create the app from `env`, or from the process environment when `env` is None."""
    settings = Settings.from_env(env)

    app = Flask(__name__)
    app.config.update(
        APP_ENV=settings.app_env,
        LOG_LEVEL=settings.log_level,
        SQLALCHEMY_DATABASE_URI=settings.database_url,
        SQLALCHEMY_ENGINE_OPTIONS={
            "pool_pre_ping": True,
            "pool_timeout": DB_POOL_TIMEOUT_SECONDS,
            "connect_args": {"connect_timeout": DB_CONNECT_TIMEOUT_SECONDS},
        },
        JWT_SECRET_KEY=settings.jwt_secret_key,
    )

    db.init_app(app)
    migrate.init_app(app, db, version_table_schema=DB_SCHEMA, include_schemas=True)
    jwt.init_app(app)
    register_request_context(app)
    register_error_handlers(app)
    app.register_blueprint(health_bp)
    app.cli.add_command(bootstrap_schema_command)
    # Register every model on db.metadata for Alembic autogenerate and the tests (DB01).
    from app import models  # noqa: F401

    return app
