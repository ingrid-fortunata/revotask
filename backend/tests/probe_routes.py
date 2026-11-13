"""Test-only routes shared by the request context and error tests. Not part of the app."""

from flask import Flask, abort, g, jsonify, request
from marshmallow import Schema, fields

from app.auth_guard import token_required
from app.exceptions import ApiError, ServiceUnavailableError
from app.validation import load_json_body


class ProbeSchema(Schema):
    name = fields.String(required=True, error_messages={"required": "Required."})


class ValidationProbe(ApiError):
    status = 400
    code = "VALIDATION_ERROR"
    message = "Check the submitted fields."


def add_probe_routes(app: Flask) -> None:
    @app.get("/_t/ok")
    def ok():
        return jsonify(data={"ok": True})

    @app.post("/_t/ok")
    def post_ok():
        return jsonify(data={"posted": True})

    @app.post("/_t/echo")
    def echo():
        request.get_data()
        return jsonify(data={"received": True})

    @app.get("/_t/boom")
    def boom():
        raise RuntimeError("leak-sentinel-exc-text")

    @app.get("/_t/unavailable")
    def unavailable():
        raise ServiceUnavailableError()

    @app.get("/_t/validation")
    def validation():
        raise ValidationProbe(fields={"title": "Required."})

    @app.get("/_t/bad")
    def bad():
        abort(400)

    @app.post("/_t/json")
    def json_body():
        return jsonify(data=load_json_body(ProbeSchema()))

    @app.get("/_t/not-acceptable")
    def not_acceptable():
        abort(406)

    @app.get("/api/_t/private")
    def api_private():
        return jsonify(data={"ok": True})

    @app.get("/_t/protected")
    @token_required
    def protected():
        return jsonify(data={"user_id": str(g.current_user.id)})

    @app.post("/_t/protected")
    @token_required
    def protected_post():
        return jsonify(data={"user_id": str(g.current_user.id)})
