"""Envelopes of the position exceptions (task 2.1; Requirements 2.4, 2.6, 4.5, 4.6)."""

import pytest

from app import create_app
from app.exceptions import InvalidDestinationError, PositionConflictError

ENV = {
    "APP_ENV": "development",
    "DATABASE_URL": "postgresql+psycopg://revotask:err-pw@127.0.0.1:1/revotask_dev",
    "JWT_SECRET_KEY": "err-test-secret-0123456789abcdef",
    "LOG_LEVEL": "INFO",
}


@pytest.fixture
def client():
    app = create_app(ENV)

    @app.get("/_t/position-conflict")
    def conflict():
        raise PositionConflictError()

    @app.get("/_t/invalid-destination")
    def destination():
        raise InvalidDestinationError()

    app.testing = False
    return app.test_client()


def test_position_conflict_is_409_with_a_stable_code(client):
    response = client.get("/_t/position-conflict", headers={"X-Request-ID": "p-409"})
    assert response.status_code == 409
    assert response.get_json() == {
        "error": {
            "code": "POSITION_CONFLICT",
            "message": "The board changed. Refresh and try again.",
            "request_id": "p-409",
        }
    }


def test_invalid_destination_is_400_with_a_fixed_message_and_no_fields(client):
    response = client.get("/_t/invalid-destination", headers={"X-Request-ID": "p-400"})
    assert response.status_code == 400
    assert response.get_json() == {
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "Choose a valid destination.",
            "request_id": "p-400",
        }
    }
