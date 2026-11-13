"""FND-AC1.2: each configuration rule fails with the variable name and never echoes a value."""

import pytest

from app.config import ConfigError, Settings

VALID_URL = "postgresql+psycopg://revotask:cfg-pw-sentinel@127.0.0.1:5432/revotask_dev"
VALID_SECRET = "x" * 32


def valid_env(**overrides):
    env = {
        "APP_ENV": "development",
        "DATABASE_URL": VALID_URL,
        "JWT_SECRET_KEY": VALID_SECRET,
        "LOG_LEVEL": "INFO",
    }
    env.update(overrides)
    return env


def test_valid_settings_are_built():
    settings = Settings.from_env(valid_env())
    assert settings.app_env == "development"
    assert settings.database_url == VALID_URL
    assert settings.jwt_secret_key == VALID_SECRET
    assert settings.log_level == "INFO"


def test_log_level_defaults_to_info_and_is_normalized():
    env = valid_env()
    del env["LOG_LEVEL"]
    assert Settings.from_env(env).log_level == "INFO"
    assert Settings.from_env(valid_env(LOG_LEVEL=" debug ")).log_level == "DEBUG"


@pytest.mark.parametrize("app_env", ["development", "test", "production"])
def test_each_allowed_app_env_is_accepted(app_env):
    secret = "p" * 32 if app_env == "production" else VALID_SECRET
    assert Settings.from_env(valid_env(APP_ENV=app_env, JWT_SECRET_KEY=secret)).app_env == app_env


@pytest.mark.parametrize(
    ("overrides", "variable"),
    [
        ({"APP_ENV": None}, "APP_ENV"),
        ({"APP_ENV": "staging"}, "APP_ENV"),
        ({"DATABASE_URL": None}, "DATABASE_URL"),
        ({"DATABASE_URL": "   "}, "DATABASE_URL"),
        ({"JWT_SECRET_KEY": None}, "JWT_SECRET_KEY"),
        ({"JWT_SECRET_KEY": ""}, "JWT_SECRET_KEY"),
        ({"LOG_LEVEL": "VERBOSE"}, "LOG_LEVEL"),
    ],
)
def test_missing_or_invalid_values_name_the_variable(overrides, variable):
    env = valid_env(**overrides)
    for key, value in overrides.items():
        if value is None:
            del env[key]
    with pytest.raises(ConfigError) as info:
        Settings.from_env(env)
    assert str(info.value).startswith(f"{variable}:")


@pytest.mark.parametrize(
    "bad_url",
    [
        "mysql://revotask:cfg-pw-sentinel@127.0.0.1/revotask_dev",
        "postgresql://revotask:cfg-pw-sentinel@127.0.0.1/revotask_dev",
        "not a url cfg-pw-sentinel",
    ],
)
def test_database_url_must_use_psycopg_driver_and_hides_the_value(bad_url):
    with pytest.raises(ConfigError) as info:
        Settings.from_env(valid_env(DATABASE_URL=bad_url))
    message = str(info.value)
    assert message.startswith("DATABASE_URL:")
    assert "cfg-pw-sentinel" not in message
    assert bad_url not in message


def test_production_secret_must_be_at_least_32_characters():
    with pytest.raises(ConfigError) as info:
        Settings.from_env(valid_env(APP_ENV="production", JWT_SECRET_KEY="short-secret-sentinel"))
    message = str(info.value)
    assert message.startswith("JWT_SECRET_KEY:")
    assert "short-secret-sentinel" not in message


def test_non_production_secret_has_no_length_floor_beyond_non_empty():
    assert Settings.from_env(valid_env(JWT_SECRET_KEY="s")).jwt_secret_key == "s"


def test_settings_do_not_read_the_process_environment_when_env_is_given(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "bad")
    settings = Settings.from_env(valid_env())
    assert settings.app_env == "development"
