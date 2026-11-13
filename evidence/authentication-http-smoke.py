"""Local HTTP smoke for the authentication slice (task 2.11).

Real HTTP against Flask (127.0.0.1:5001, Docker Compose) and the Next production server. It
prints statuses, selected headers and redacted Set-Cookie attributes. It never prints the
password, a token or a cookie value. It creates one throwaway account and deletes it.

Run from backend/ with the virtualenv active (it needs PyJWT and psycopg), Flask up through
`docker compose up -d backend`, and Next started as
`APP_ORIGIN=http://localhost:3100 npx next start -p 3100` from frontend/ after `npm run build`:

    python ../evidence/authentication-http-smoke.py

It stops and restarts the `backend` Compose service once, to check the upstream-failure paths.
It ends with deliberate wrong-password logins to show the rate limit, so wait a minute before
running it again. Environment overrides: NEXT_HOST, NEXT_PORT.
"""
import http.client, json, os, re, subprocess, sys, time, uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
NEXT = (os.environ.get("NEXT_HOST", "localhost"), int(os.environ.get("NEXT_PORT", "3100")))
FLASK = ("127.0.0.1", 5001)
ORIGIN = f"http://{NEXT[0]}:{NEXT[1]}"
FAILS = []

def env_value(name):
    for line in (REPO / "backend/.env").read_text().splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"{name} missing")

def request(target, method, path, headers=None, body=None):
    conn = http.client.HTTPConnection(*target, timeout=20)
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    h = dict(headers or {})
    if isinstance(body, dict) and "Content-Type" not in h:
        h["Content-Type"] = "application/json"
    conn.request(method, path, body=data, headers=h)
    resp = conn.getresponse()
    raw = resp.read()
    out = {"status": resp.status, "headers": resp.getheaders(), "raw": raw}
    conn.close()
    return out

def hv(res, name):
    return [v for k, v in res["headers"] if k.lower() == name.lower()]

def text(res):
    return res["raw"].decode("utf-8", "replace")

def js(res):
    try:
        return json.loads(res["raw"])
    except ValueError:
        return None

def redact(value):
    return re.sub(r"(revotask_session=)[^;]*", lambda m: m.group(1) + ("<redacted>" if len(value.split("=", 1)[1].split(";")[0]) else "<empty>"), value)

def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f"  ({detail})" if detail else ""))
    if not ok:
        FAILS.append(label)

def show(label, res, extra=""):
    print(f"  {label:<58} -> {res['status']} {extra}")

def section(title):
    print(f"\n### {title}")

def with_origin(extra=None):
    return {"Origin": ORIGIN, **(extra or {})}

def cookie_header(token):
    return {"Cookie": f"revotask_session={token}"}

def session_cookie(res):
    for v in hv(res, "Set-Cookie"):
        if v.startswith("revotask_session="):
            return v
    return None

# ---------------------------------------------------------------- setup
email = f"smoke-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.test"
password = os.urandom(12).hex() + "Aa1"           # never printed
name = "Smoke User"
good = {"name": name, "email": f"  {email.upper()} ", "password": password}
print(f"throwaway account: {email}")
print(f"Next {NEXT[0]}:{NEXT[1]}  Flask {FLASK[0]}:{FLASK[1]}  APP_ORIGIN={ORIGIN}")

# ---------------------------------------------------------------- 1
section("1. Exact fields, content type, size and Origin")
r = request(NEXT, "POST", "/api/auth/register", {"Content-Type": "application/json"}, good)
show("register, no Origin (Next)", r); check("403 without Origin", r["status"] == 403 and js(r)["error"]["code"] == "FORBIDDEN")
r = request(NEXT, "POST", "/api/auth/register", with_origin({"Origin": "http://evil.example"}), good)
show("register, Origin http://evil.example (Next)", r); check("403 for a cross-site Origin", r["status"] == 403)
r = request(NEXT, "POST", "/api/auth/register", with_origin(), {**good, "role": "admin"})
show("register, extra field `role` (Next)", r, str(js(r)["error"].get("fields"))); check("400 Unknown field.", r["status"] == 400 and js(r)["error"]["fields"] == {"role": "Unknown field."})
r = request(NEXT, "POST", "/api/auth/register", with_origin(), {"name": "x", "email": "x@y.co"})
show("register, missing `password` (Next)", r, str(js(r)["error"].get("fields"))); check("400 Required.", r["status"] == 400 and js(r)["error"]["fields"] == {"password": "Required."})
r = request(NEXT, "POST", "/api/auth/register", with_origin({"Content-Type": "text/plain"}), b"{}")
show("register, Content-Type text/plain (Next)", r); check("415", r["status"] == 415 and js(r)["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE")
big = json.dumps({**good, "name": "a" * 70000}).encode()
r = request(NEXT, "POST", "/api/auth/register", with_origin({"Content-Type": "application/json"}), big)
show("register, body over 64 KiB (Next)", r); check("413", r["status"] == 413 and js(r)["error"]["code"] == "CONTENT_TOO_LARGE")
r = request(NEXT, "POST", "/api/auth/login", with_origin(), {"email": "a@b.co", "password": "x", "remember": True})
show("login, extra field `remember` (Next)", r); check("400 Unknown field.", r["status"] == 400 and js(r)["error"]["fields"] == {"remember": "Unknown field."})
r = request(NEXT, "POST", "/api/auth/login", with_origin(), {"email": "a@b.co"})
show("login, missing `password` (Next)", r); check("400 Required.", r["status"] == 400 and js(r)["error"]["fields"] == {"password": "Required."})
r = request(NEXT, "POST", "/api/auth/login", with_origin({"Content-Type": "text/plain"}), b"x")
show("login, Content-Type text/plain (Next)", r); check("415", r["status"] == 415)
# straight to Flask
r = request(FLASK, "POST", "/api/auth/register", {}, {**good, "role": "admin"})
show("register, extra field, straight to Flask", r, str(js(r)["error"].get("fields"))); check("Flask 400 Unknown field.", r["status"] == 400 and js(r)["error"]["fields"] == {"role": "Unknown field."})
r = request(FLASK, "POST", "/api/auth/register", {"Content-Type": "text/plain"}, b"{}")
show("register, text/plain, straight to Flask", r); check("Flask 415", r["status"] == 415)
r = request(FLASK, "POST", "/api/auth/login", {}, {"email": "a@b.co", "password": "x", "remember": True})
show("login, extra field, straight to Flask", r); check("Flask 400 Unknown field.", r["status"] == 400)
# exact fields
r = request(NEXT, "POST", "/api/auth/register", with_origin(), good)
show("register, exact three fields, mixed-case padded email", r, str(js(r)))
user = (js(r) or {}).get("data", {})
check("201 with only id, name, email", r["status"] == 201 and set(user) == {"id", "name", "email"})
check("email stored trimmed and lowercase", user.get("email") == email.lower())
check("no Set-Cookie after register (user stays signed out)", session_cookie(r) is None)
check("no password or token in the body", password not in text(r) and "access_token" not in text(r))
r = request(NEXT, "POST", "/api/auth/register", with_origin(), good)
show("register the same email again", r); check("409 EMAIL_ALREADY_EXISTS", r["status"] == 409 and js(r)["error"]["code"] == "EMAIL_ALREADY_EXISTS")

# ---------------------------------------------------------------- 2
section("2. Invalid credentials")
bad_pw = request(NEXT, "POST", "/api/auth/login", with_origin(), {"email": email, "password": "wrong-password-0000"})
unknown = request(NEXT, "POST", "/api/auth/login", with_origin(), {"email": f"nobody-{uuid.uuid4().hex[:8]}@example.test", "password": "wrong-password-0000"})
show("login, wrong password", bad_pw); show("login, unknown email", unknown)
def body_wo_id(res):
    d = js(res); d["error"].pop("request_id", None); return d
check("both 401 INVALID_CREDENTIALS", bad_pw["status"] == unknown["status"] == 401 and js(bad_pw)["error"]["code"] == "INVALID_CREDENTIALS")
check("identical bodies apart from request_id", body_wo_id(bad_pw) == body_wo_id(unknown), str(body_wo_id(bad_pw)))
check("no Set-Cookie on a failed login", session_cookie(bad_pw) is None and session_cookie(unknown) is None)

# ---------------------------------------------------------------- 3
section("3. Login and cookie flags")
r = request(NEXT, "POST", "/api/auth/login", with_origin(), {"email": f"  {email.upper()}", "password": password})
show("login, correct credentials", r, str(js(r)))
body = js(r) or {}
check("200 with {data:{user}} only", r["status"] == 200 and list(body.get("data", {})) == ["user"] and set(body["data"]["user"]) == {"id", "name", "email"})
check("no access_token or hash in the body", "access_token" not in text(r) and "hash" not in text(r).lower())
raw_cookie = session_cookie(r)
print("        Set-Cookie:", redact(raw_cookie or "<none>"))
attrs = [a.strip() for a in (raw_cookie or "").split(";")][1:]
low = [a.lower() for a in attrs]
token = raw_cookie.split("=", 1)[1].split(";")[0] if raw_cookie else ""
check("HttpOnly", "httponly" in low)
check("SameSite=Lax", "samesite=lax" in low)
check("Path=/", "path=/" in low)
check("no Domain (host-only)", not any(a.startswith("domain") for a in low))
check("no Secure on the loopback http origin", "secure" not in low)
age = next((int(a.split("=")[1]) for a in low if a.startswith("max-age=")), None)
check("Max-Age at most 3600", age is not None and 3500 < age <= 3600, str(age))
check("the token appears only in Set-Cookie", token and all(token not in v for k, v in r["headers"] if k.lower() != "set-cookie") and token not in text(r))
check("Cache-Control private, no-store", hv(r, "Cache-Control") == ["private, no-store"])

# ---------------------------------------------------------------- 4
section("4. Protected render")
anon = request(NEXT, "GET", "/")
show("GET / without a cookie", anon, "Location=" + str(hv(anon, "Location")))
check("307 to /login", anon["status"] == 307 and hv(anon, "Location") == ["/login"])
check("no private content in the redirect body", name not in text(anon))
signed = request(NEXT, "GET", "/", cookie_header(token))
show("GET / with the session cookie", signed)
check("200 with the user's name and Sign out", signed["status"] == 200 and name in text(signed) and "Sign out" in text(signed))
print("        Cache-Control (signed in):", hv(signed, "Cache-Control"))
print("        Cache-Control (redirect): ", hv(anon, "Cache-Control"))
check("no-store on both responses", all("no-store" in " ".join(hv(x, "Cache-Control")) for x in (anon, signed)))
check("token not present in the HTML", token not in text(signed))
check("password and hash not present in the HTML", password not in text(signed) and "password_hash" not in text(signed))

# ---------------------------------------------------------------- 5
section("5. Expired and tampered sessions")
import jwt as pyjwt
secret = env_value("JWT_SECRET_KEY")
now = int(time.time())
expired = pyjwt.encode({"sub": user["id"], "jti": str(uuid.uuid4()), "iat": now - 7200, "exp": now - 3600}, secret, algorithm="HS256")
r = request(FLASK, "GET", "/api/users/me", {"Authorization": f"Bearer {expired}"})
show("expired token -> Flask GET /api/users/me", r); check("401 AUTH_REQUIRED", r["status"] == 401 and js(r)["error"]["code"] == "AUTH_REQUIRED")
r = request(NEXT, "GET", "/", cookie_header(expired))
show("expired token as cookie -> Next GET /", r, "Location=" + str(hv(r, "Location"))); check("307 to /login", r["status"] == 307 and hv(r, "Location") == ["/login"])
head, payload, sig = token.split(".")
tampered = f"{head}.{payload}.{'A' if sig[0] != 'A' else 'B'}{sig[1:]}"
r = request(NEXT, "GET", "/", cookie_header(tampered))
show("tampered cookie -> Next GET /", r); check("307 to /login", r["status"] == 307)
r = request(NEXT, "GET", "/login", cookie_header(tampered))
show("tampered cookie -> Next GET /login", r); check("200: /login tolerates a stale cookie", r["status"] == 200)
r = request(NEXT, "GET", "/register", cookie_header(tampered))
show("tampered cookie -> Next GET /register", r); check("200", r["status"] == 200)

# ---------------------------------------------------------------- 6
section("6. Logout")
r = request(NEXT, "POST", "/api/auth/logout", cookie_header(token))
show("logout without Origin", r); check("403", r["status"] == 403 and session_cookie(r) is None)
still = request(NEXT, "GET", "/", cookie_header(token))
check("session still valid after the rejected logout", still["status"] == 200)
r = request(NEXT, "POST", "/api/auth/logout", with_origin(cookie_header(token)))
show("logout with Origin and cookie", r, str(js(r)))
cleared = session_cookie(r)
print("        Set-Cookie:", redact(cleared or "<none>"))
check("200 {data:null}", r["status"] == 200 and js(r) == {"data": None})
check("cookie cleared: empty value, Max-Age=0, Path=/, no Domain", bool(cleared) and cleared.startswith("revotask_session=;") and "Max-Age=0" in cleared and "Path=/" in cleared and "Domain" not in cleared)
r = request(NEXT, "POST", "/api/auth/logout", with_origin())
show("logout again with no cookie", r); check("200 and cookie cleared (idempotent)", r["status"] == 200 and bool(session_cookie(r)))
r = request(NEXT, "POST", "/api/auth/logout", with_origin(cookie_header(token)))
show("logout with the already-revoked cookie", r); check("200 and cookie cleared", r["status"] == 200 and bool(session_cookie(r)))

# ---------------------------------------------------------------- 7
section("7. Revoked session replay")
r = request(FLASK, "GET", "/api/users/me", {"Authorization": f"Bearer {token}"})
show("old token -> Flask GET /api/users/me", r); check("401 AUTH_REQUIRED", r["status"] == 401 and js(r)["error"]["code"] == "AUTH_REQUIRED")
r = request(NEXT, "GET", "/", cookie_header(token))
show("old cookie -> Next GET /", r, "Location=" + str(hv(r, "Location"))); check("307 to /login", r["status"] == 307 and hv(r, "Location") == ["/login"])

# ---------------------------------------------------------------- 8
section("8. Upstream failure (Flask stopped)")
r = request(NEXT, "POST", "/api/auth/login", with_origin(), {"email": email, "password": password})
token2 = session_cookie(r).split("=", 1)[1].split(";")[0]
check("fresh session issued", r["status"] == 200)
subprocess.run(["docker", "compose", "stop", "backend"], cwd=REPO, capture_output=True)
try:
    r = request(NEXT, "GET", "/", cookie_header(token2))
    show("GET / while Flask is down", r, "Location=" + str(hv(r, "Location")))
    check("500 and no redirect to /login", r["status"] == 500 and not hv(r, "Location"))
    leaks = [w for w in ("ECONNREFUSED", "127.0.0.1", "5001", "Traceback", "at fetch") if w in text(r)]
    check("no internals in the server HTML", not leaks, str(leaks))
    print("        (the visible error state and Try again render client-side; checked in the browser run)")
    r = request(NEXT, "POST", "/api/auth/logout", with_origin(cookie_header(token2)))
    show("logout while Flask is down", r, str(js(r)))
    check("503 SERVICE_UNAVAILABLE", r["status"] == 503 and js(r)["error"]["code"] == "SERVICE_UNAVAILABLE")
    check("the cookie is kept (no clearing Set-Cookie)", session_cookie(r) is None)
    r = request(NEXT, "POST", "/api/auth/login", with_origin(), {"email": email, "password": password})
    show("login while Flask is down", r); check("503 and no cookie", r["status"] == 503 and session_cookie(r) is None)
finally:
    subprocess.run(["docker", "compose", "up", "-d", "backend"], cwd=REPO, capture_output=True)
for _ in range(20):
    try:
        if request(FLASK, "GET", "/api/health")["status"] == 200:
            break
    except OSError:
        time.sleep(1)
r = request(NEXT, "GET", "/", cookie_header(token2))
show("GET / after Flask is back, same cookie", r); check("200: the session survived the outage", r["status"] == 200)
r = request(NEXT, "POST", "/api/auth/logout", with_origin(cookie_header(token2)))
check("logout now succeeds", r["status"] == 200 and bool(session_cookie(r)))

# ---------------------------------------------------------------- 9
section("9. Unsafe redirects (the `next` value reaches the form only if safe)")
for nxt, safe in (("//evil.example", False), ("https://evil.example", False), ("/login", False), ("/\\evil.example", False), ("/boards/abc", True)):
    from urllib.parse import quote
    r = request(NEXT, "GET", "/login?next=" + quote(nxt, safe=""))
    body_text = text(r)
    m = re.search(r'redirectTo\\":\\"([^"\\]*)', body_text)
    got = m.group(1) if m else None
    want = "/boards/abc" if safe else "/"
    check(f"next={nxt} -> the form receives redirectTo={want}", r["status"] == 200 and got == want, f"got {got}")

# ---------------------------------------------------------------- 10
section("10. Rate limit (local behavior only: in-memory counters in one container)")
victim = f"ratelimit-{uuid.uuid4().hex[:8]}@example.test"
codes = []
for i in range(6):
    r = request(NEXT, "POST", "/api/auth/login", with_origin(), {"email": victim, "password": "wrong-password-0000"})
    codes.append(r["status"])
print("        statuses:", codes)
check("five 401s, then 429", codes == [401] * 5 + [429])
show("6th attempt", r, str(js(r)["error"]["code"]) + " Retry-After=" + str(hv(r, "Retry-After")))
check("429 RATE_LIMITED with Retry-After and a request id", js(r)["error"]["code"] == "RATE_LIMITED" and hv(r, "Retry-After") and js(r)["error"]["request_id"])

# ---------------------------------------------------------------- cleanup
section("Cleanup")
db_url = env_value("DATABASE_URL").replace("postgresql+psycopg://", "postgresql://")
import psycopg
with psycopg.connect(db_url) as conn:
    cur = conn.execute("DELETE FROM revotask.users WHERE email = %s", (email.lower(),))
    print("  deleted users:", cur.rowcount)
    cur = conn.execute("DELETE FROM revotask.revoked_tokens WHERE jti = ANY(%s::uuid[])", ([pyjwt.decode(t, options={"verify_signature": False})["jti"] for t in (token, token2)],))
    print("  deleted revoked_tokens:", cur.rowcount)
print("\nRESULT:", "ALL PASS" if not FAILS else f"{len(FAILS)} FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
