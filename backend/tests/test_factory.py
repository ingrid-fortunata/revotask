"""FND-AC1.1, FND-AC1.3: the factory builds the app, initializes extensions,
and registers no feature routes."""

import pytest
from flask import Flask

from app import create_app
from app.config import ConfigError
from app.extensions import db

VALID_ENV = {
    "APP_ENV": "development",
    # Port 1 is never listening. create_app must not connect, so this still builds.
    "DATABASE_URL": "postgresql+psycopg://revotask:factory-pw@127.0.0.1:1/revotask_dev",
    "JWT_SECRET_KEY": "factory-test-secret-0123456789abcdef",
    "LOG_LEVEL": "INFO",
}


def test_create_app_returns_a_flask_app_without_connecting():
    app = create_app(VALID_ENV)
    assert isinstance(app, Flask)
    assert app.config["APP_ENV"] == "development"


def test_extensions_are_initialized_on_the_app():
    app = create_app(VALID_ENV)
    assert "sqlalchemy" in app.extensions
    assert "migrate" in app.extensions
    assert "flask-jwt-extended" in app.extensions
    assert app.config["SQLALCHEMY_DATABASE_URI"] == VALID_ENV["DATABASE_URL"]


def test_engine_options_bound_connection_and_pool_waits():
    app = create_app(VALID_ENV)
    options = app.config["SQLALCHEMY_ENGINE_OPTIONS"]
    assert options["pool_pre_ping"] is True
    assert options["pool_timeout"] == 2
    assert options["connect_args"] == {"connect_timeout": 2}


def test_registered_routes_match_the_implemented_slices():
    """Foundation registered health only. Later slices add the routes below (T03 to T12)."""
    app = create_app(VALID_ENV)
    endpoints = {rule.endpoint for rule in app.url_map.iter_rules() if rule.endpoint != "static"}
    assert endpoints == {
        "health.get_health",
        "auth.register",
        "auth.login",
        "auth.logout",
        "users.get_me",
        "users.patch_me",
        "boards.list_boards_view",
        "boards.create_board_view",
        "boards.get_board_view",
        "boards.update_board_view",
        "boards.delete_board_view",
        "boards.list_members_view",
        "boards.add_member_view",
        "boards.remove_member_view",
        "columns.create_column_view",
        "columns.update_column_view",
        "columns.delete_column_view",
        "columns.reorder_columns_view",
        "cards.create_card_view",
        "cards.update_card_view",
        "cards.delete_card_view",
        "cards.move_card_view",
        "cards.list_my_tasks_view",
        "cards.search_cards_view",
        "comments.list_comments_view",
        "comments.create_comment_view",
        "comments.update_comment_view",
        "comments.delete_comment_view",
        "notifications.list_notifications",
        "notifications.mark_read_view",
        "analytics.board_analytics_view",
    }


def test_each_factory_call_returns_an_independent_app():
    first = create_app(VALID_ENV)
    second = create_app({**VALID_ENV, "APP_ENV": "test"})
    assert first is not second
    assert first.config["APP_ENV"] == "development"
    assert second.config["APP_ENV"] == "test"


def test_invalid_settings_stop_app_creation():
    with pytest.raises(ConfigError):
        create_app({**VALID_ENV, "APP_ENV": "staging"})


def test_shared_metadata_uses_the_revotask_schema_and_naming_convention():
    assert db.metadata.schema == "revotask"
    assert db.metadata.naming_convention["fk"].startswith("fk_%(table_name)s")
