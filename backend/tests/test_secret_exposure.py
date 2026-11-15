"""V13 repository and bundle secret checks, by value.

The real secrets are read from the git-ignored backend/.env (the JWT key and the database
passwords) and must appear in no tracked file and no file of the built client bundle. Values that
also appear in `.env.example` are placeholders and are skipped. Failure messages name the file and
never the secret.

Skipped, never passed, when the local `.env` has no real secret or the frontend was not built.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from dotenv import dotenv_values
from sqlalchemy.engine import make_url

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
BUNDLE = ROOT / "frontend" / ".next" / "static"


def _passwords(values: dict) -> set[str]:
    found = set()
    for key in ("DATABASE_URL", "TEST_DATABASE_URL"):
        if values.get(key):
            password = make_url(values[key]).password
            if password:
                found.add(password)
    return found


def _real_secrets() -> set[str]:
    real = dotenv_values(BACKEND / ".env")
    example = dotenv_values(BACKEND / ".env.example")
    secrets = _passwords(real) | {real.get("JWT_SECRET_KEY")}
    secrets -= {example.get("JWT_SECRET_KEY")} | _passwords(example)
    return {s for s in secrets if s and len(s) >= 8}


@pytest.fixture(scope="module")
def secrets() -> set[str]:
    found = _real_secrets()
    if not found:
        pytest.skip("backend/.env holds no secret that differs from .env.example")
    return found


def _leaks(paths, secrets: set[str]) -> list[str]:
    needles = [s.encode() for s in secrets]
    return [
        str(path.relative_to(ROOT))
        for path in paths
        if path.is_file() and any(n in path.read_bytes() for n in needles)
    ]


def test_no_tracked_file_contains_a_real_secret(secrets):
    """Expected: zero tracked files hold the local JWT key or database password."""
    listing = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
    ).stdout.split(b"\0")
    tracked = [ROOT / name.decode() for name in listing if name]
    assert _leaks(tracked, secrets) == []


def test_no_tracked_env_file_besides_the_examples():
    """Expected: only `.env.example` files are tracked."""
    listing = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    env_files = [n for n in listing if Path(n).name.startswith(".env")]
    assert sorted(env_files) == [".env.example", "backend/.env.example", "frontend/.env.example"]


def test_the_built_client_bundle_contains_no_real_secret(secrets):
    """Expected: no file under frontend/.next/static holds the local JWT key or DB password."""
    if not BUNDLE.is_dir():
        pytest.skip("frontend/.next/static is missing: run `npm run build` first")
    assert _leaks(BUNDLE.rglob("*"), secrets) == []
