"""Test-only routes shared by the request context and error tests. Not part of the app."""

from flask import Flask, abort, jsonify, request

from app.exceptions import ApiError, ServiceUnavailableError


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
