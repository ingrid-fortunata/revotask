"""Shared Flask extension objects. They are bound to the app in `create_app`."""

from __future__ import annotations

from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import MetaData

from app.config import DB_SCHEMA

# A fixed naming convention keeps Alembic revisions deterministic (design §4.2).
NAMING_CONVENTION = {
    "pk": "pk_%(table_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "ix": "ix_%(table_name)s_%(column_0_name)s",
}

db = SQLAlchemy(metadata=MetaData(schema=DB_SCHEMA, naming_convention=NAMING_CONVENTION))
migrate = Migrate()
jwt = JWTManager()
# Rate limits for register and login. Memory storage is for local development only and keeps
# counters per process. Shared storage and trusted client address handling are decided
# before production traffic (root T16, AUTH-AC6.6).
limiter = Limiter(key_func=get_remote_address)
