"""Flask application factory for the RevoTask API (BE01).

Feature Blueprints are registered here as their tasks land. The factory opens
no database connection, so importing or creating the app works without a
running database.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import timedelta

from flask import Flask

from app.auth_guard import register_jwt_handlers
from app.blueprints.auth import auth_bp
from app.blueprints.boards import boards_bp
from app.blueprints.cards import cards_bp
from app.blueprints.columns import columns_bp
from app.blueprints.comments import comments_bp
from app.blueprints.health import health_bp
from app.blueprints.users import users_bp
from app.cli import bootstrap_schema_command
from app.config import (
    ACCESS_TOKEN_TTL_SECONDS,
    DB_CONNECT_TIMEOUT_SECONDS,
    DB_POOL_TIMEOUT_SECONDS,
    DB_SCHEMA,
    MAX_REQUEST_BODY_BYTES,
    Settings,
)
from app.errors import register_error_handlers
from app.extensions import db, jwt, limiter, migrate
from app.request_context import register_request_context
from app.response_headers import register_response_headers


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
        JWT_ACCESS_TOKEN_EXPIRES=timedelta(seconds=ACCESS_TOKEN_TTL_SECONDS),
        JWT_TOKEN_LOCATION=["headers"],  # Flask never reads a cookie for the token
        JWT_ALGORITHM="HS256",
        MAX_CONTENT_LENGTH=MAX_REQUEST_BODY_BYTES,
        RATELIMIT_ENABLED=settings.rate_limit_enabled,
        RATELIMIT_STORAGE_URI="memory://",
        RATELIMIT_HEADERS_ENABLED=True,
    )

    db.init_app(app)
    migrate.init_app(app, db, version_table_schema=DB_SCHEMA, include_schemas=True)
    jwt.init_app(app)
    register_jwt_handlers(jwt)
    register_request_context(app)
    register_error_handlers(app)
    register_response_headers(app)
    # Decorator limits run in the view wrapper, after every before_request hook. App-wide default
    # limits would run in before_request, so keep the limiter after the request-ID hook.
    limiter.init_app(app)
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(boards_bp)
    app.register_blueprint(columns_bp)
    app.register_blueprint(cards_bp)
    app.register_blueprint(comments_bp)
    app.cli.add_command(bootstrap_schema_command)
    # Register every model on db.metadata for Alembic autogenerate and the tests (DB01).
    from app import models  # noqa: F401

    return app
