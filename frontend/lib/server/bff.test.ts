// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  errorResponse,
  MAX_BODY_BYTES,
  passThrough,
  privateJson,
  readJsonObject,
} from "./bff";
import type { FlaskResult } from "./flask";

const KEYS = ["email", "password"] as const;

function post(body: BodyInit | null, headers: Record<string, string> = { "content-type": "application/json" }) {
  return new Request("http://localhost:3000/api/auth/login", { method: "POST", headers, body });
}

async function failure(request: Request) {
  const result = await readJsonObject(request, KEYS, "rid");
  if (result.ok) throw new Error("expected a failure");
  return { status: result.response.status, json: await result.response.json() };
}

describe("readJsonObject", () => {
  it("returns the object for an exact key set and accepts a charset parameter", async () => {
    const request = post(JSON.stringify({ email: "a@b.co", password: "x" }), {
      "content-type": "Application/JSON; charset=utf-8",
    });
    const result = await readJsonObject(request, KEYS, "rid");
    expect(result).toEqual({ ok: true, body: { email: "a@b.co", password: "x" } });
  });

  it.each([undefined, "text/plain", "application/x-www-form-urlencoded", "application/jsonx"])(
    "returns 415 for content type %s",
    async (contentType) => {
      const headers: Record<string, string> = contentType ? { "content-type": contentType } : {};
      const { status, json } = await failure(post("{}", headers));
      expect(status).toBe(415);
      expect(json.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
      expect(json.error.request_id).toBe("rid");
    },
  );

  it("returns 413 for a body over the cap with no Content-Length header", async () => {
    const big = JSON.stringify({ email: "a".repeat(MAX_BODY_BYTES), password: "x" });
    const request = post(big);
    const { status, json } = await failure(request);
    expect(status).toBe(413);
    expect(json.error.code).toBe("CONTENT_TOO_LARGE");
  });

  it("returns 413 early when Content-Length declares more than the cap", async () => {
    const { status } = await failure(
      post("{}", { "content-type": "application/json", "content-length": String(MAX_BODY_BYTES + 1) }),
    );
    expect(status).toBe(413);
  });

  it("counts bytes as it reads when Content-Length understates the size", async () => {
    const big = JSON.stringify({ email: "a".repeat(MAX_BODY_BYTES), password: "x" });
    const request = new Request("http://localhost:3000/x", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "10" },
      body: big,
    });
    const { status } = await failure(request);
    expect(status).toBe(413);
  });

  it("accepts a body exactly at the cap", async () => {
    const filler = "a".repeat(MAX_BODY_BYTES - JSON.stringify({ email: "", password: "x" }).length);
    const result = await readJsonObject(post(JSON.stringify({ email: filler, password: "x" })), KEYS, "rid");
    expect(result.ok).toBe(true);
  });

  it.each(["{oops", "", "[1]", "null", "12", '"text"'])("returns 400 without fields for %j", async (raw) => {
    const { status, json } = await failure(post(raw));
    expect(status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error).not.toHaveProperty("fields");
  });

  it("returns 400 for bytes that are not valid UTF-8", async () => {
    const { status } = await failure(post(new Uint8Array([0x7b, 0xff, 0x7d])));
    expect(status).toBe(400);
  });

  it("reports an extra key as Unknown field. and a missing key as Required.", async () => {
    const extra = await failure(post(JSON.stringify({ email: "a", password: "b", role: "admin" })));
    expect(extra.status).toBe(400);
    expect(extra.json.error.fields).toEqual({ role: "Unknown field." });
    const missing = await failure(post(JSON.stringify({ email: "a" })));
    expect(missing.json.error.fields).toEqual({ password: "Required." });
    const none = await failure(post("{}"));
    expect(none.json.error.fields).toEqual({ email: "Required.", password: "Required." });
  });

  it("treats a __proto__ key as an unknown field", async () => {
    const { json } = await failure(post('{"email":"a","password":"b","__proto__":{"x":1}}'));
    // An object literal with __proto__ would set the prototype, so read the own property.
    expect(Object.getOwnPropertyDescriptor(json.error.fields, "__proto__")?.value).toBe("Unknown field.");
    expect(Object.keys(json.error.fields)).toEqual(["__proto__"]);
  });
});

describe("responses", () => {
  it("marks every response private and carries the request id", async () => {
    const response = privateJson({ data: null }, 200, "rid-1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBe("rid-1");
    const error = errorResponse(403, "FORBIDDEN", "No.", "rid-2");
    expect(error.headers.get("cache-control")).toBe("private, no-store");
    expect(await error.json()).toEqual({ error: { code: "FORBIDDEN", message: "No.", request_id: "rid-2" } });
  });
});

describe("passThrough", () => {
  const result = (status: number, body: unknown, retryAfter: string | null = null): FlaskResult => ({
    status,
    body,
    retryAfter,
    requestId: "rid",
  });

  it("keeps a success envelope and status", async () => {
    const response = passThrough(result(201, { data: { id: "1" }, extra: "dropped" }), "rid");
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { id: "1" } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps a 4xx error envelope, fields and request id, and drops unknown keys", async () => {
    const body = {
      error: { code: "VALIDATION_ERROR", message: "Check.", fields: { a: "Required.", b: 3 }, request_id: "f-1", stack: "x" },
    };
    const response = passThrough(result(400, body), "rid");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Check.", fields: { a: "Required." }, request_id: "f-1" },
    });
  });

  it("copies Retry-After on 429 only", () => {
    const body = { error: { code: "RATE_LIMITED", message: "Slow down." } };
    expect(passThrough(result(429, body, "30"), "rid").headers.get("retry-after")).toBe("30");
    expect(passThrough(result(409, { error: { code: "X", message: "y" } }, "30"), "rid").headers.get("retry-after")).toBeNull();
  });

  it.each([
    [502, "<html>Bad Gateway</html>"],
    [500, { error: { code: "INTERNAL_ERROR", message: "boom" } }],
    [503, null],
    [200, { not: "an envelope" }],
    [400, "text"],
    [400, { error: { code: 5 } }],
    [418, null],
    [100, {}],
  ])("turns status %s with body %j into the fixed 503 envelope", async (status, body) => {
    const response = passThrough(result(status, body), "rid");
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(json)).not.toMatch(/Bad Gateway|boom/);
  });
});
