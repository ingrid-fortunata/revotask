"""Environment settings for the Flask API.

Validation runs once when the app is created. Error messages name the offending
variable and the rule it broke. They never include the value, because values
can be connection strings or secrets (FND-AC1.2, BE08).
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

DB_SCHEMA = "revotask"
DB_CONNECT_TIMEOUT_SECONDS = 2
DB_POOL_TIMEOUT_SECONDS = 2
HEALTH_STATEMENT_TIMEOUT_MS = 1000

DATABASE_DRIVER = "postgresql+psycopg"
APP_ENVS = ("development", "test", "production")
LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
PRODUCTION_MIN_SECRET_LENGTH = 32


class ConfigError(RuntimeError):
    """A required setting is missing or invalid. The message names the variable only."""


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    jwt_secret_key: str
    log_level: str

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        """Build settings from `env`, or from `os.environ` when `env` is None.

        When `env` is given it replaces the process environment entirely, so
        tests stay independent of the developer's shell.
        """
        source: Mapping[str, str] = os.environ if env is None else env

        app_env = _required(source, "APP_ENV")
        if app_env not in APP_ENVS:
            raise ConfigError(f"APP_ENV: must be one of {', '.join(APP_ENVS)}.")

        database_url = _required(source, "DATABASE_URL")
        _check_database_url(database_url)

        jwt_secret_key = _required(source, "JWT_SECRET_KEY")
        if app_env == "production" and len(jwt_secret_key) < PRODUCTION_MIN_SECRET_LENGTH:
            raise ConfigError(
                "JWT_SECRET_KEY: must be at least "
                f"{PRODUCTION_MIN_SECRET_LENGTH} characters when APP_ENV is production."
            )

        log_level = source.get("LOG_LEVEL", "INFO").strip().upper() or "INFO"
        if log_level not in LOG_LEVELS:
            raise ConfigError(f"LOG_LEVEL: must be one of {', '.join(LOG_LEVELS)}.")

        return cls(
            app_env=app_env,
            database_url=database_url,
            jwt_secret_key=jwt_secret_key,
            log_level=log_level,
        )


def _required(source: Mapping[str, str], name: str) -> str:
    value = source.get(name, "")
    if not value.strip():
        raise ConfigError(f"{name}: a value is required.")
    return value


def _check_database_url(database_url: str) -> None:
    try:
        url = make_url(database_url)
    except ArgumentError:
        # SQLAlchemy's parse error echoes the whole URL, so it is not re-raised.
        raise ConfigError("DATABASE_URL: not a valid SQLAlchemy URL.") from None
    if url.drivername != DATABASE_DRIVER:
        raise ConfigError(f"DATABASE_URL: the driver must be {DATABASE_DRIVER}.")
