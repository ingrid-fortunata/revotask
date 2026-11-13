"""GET /api/health (E01). Thin route: call the service, then serialize (BE02)."""

from flask import jsonify

from app.blueprints.health import health_bp
from app.blueprints.health.service import check_database
from app.config import HEALTH_STATEMENT_TIMEOUT_MS
from app.extensions import db


@health_bp.get("/api/health")
def get_health():
    check_database(db.engine, statement_timeout_ms=HEALTH_STATEMENT_TIMEOUT_MS)
    return jsonify(data={"status": "ok"})
