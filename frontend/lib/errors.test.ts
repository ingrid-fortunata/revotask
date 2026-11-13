import { describe, expect, it } from "vitest";
import {
  ApiError,
  apiErrorFromEnvelope,
  isKnownCode,
  malformedApiError,
  networkApiError,
  parsePublicUser,
  parseRetryAfter,
} from "./errors";

describe("apiErrorFromEnvelope", () => {
  it("keeps status, code, message, fields and request id", () => {
    const error = apiErrorFromEnvelope(400, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the submitted fields.",
        fields: { email: "Enter a valid email address.", ignored: 5 },
        request_id: "req-1",
      },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields).toEqual({ email: "Enter a valid email address." });
    expect(error.requestId).toBe("req-1");
  });

  it("omits fields when the envelope has none", () => {
    const error = apiErrorFromEnvelope(401, {
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      },
    });
    expect(error.fields).toBeUndefined();
    expect(error.message).toBe("Invalid email or password.");
  });

  it("reads Retry-After seconds and ignores dates", () => {
    const body = {
      error: { code: "RATE_LIMITED", message: "Too many requests." },
    };
    expect(apiErrorFromEnvelope(429, body, "42").retryAfterSeconds).toBe(42);
    expect(
      apiErrorFromEnvelope(429, body, "Wed, 21 Oct 2026 07:28:00 GMT")
        .retryAfterSeconds,
    ).toBeUndefined();
    expect(parseRetryAfter("1.2")).toBe(2);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("-5")).toBeUndefined();
  });

  it("uses fallback copy for an unknown code, never the server text", () => {
    const error = apiErrorFromEnvelope(418, {
      error: { code: "TEAPOT_LEAK", message: "SELECT * FROM users; traceback" },
    });
    expect(error.code).toBe("TEAPOT_LEAK");
    expect(error.message).toBe("Something went wrong. Try again.");
    expect(error.message).not.toMatch(/SELECT/);
  });

  it("replaces an empty or overlong message for a known code", () => {
    const long = "x".repeat(500);
    expect(
      apiErrorFromEnvelope(503, {
        error: { code: "SERVICE_UNAVAILABLE", message: long },
      }).message,
    ).toBe("The service is temporarily unavailable. Try again shortly.");
    expect(
      apiErrorFromEnvelope(503, {
        error: { code: "SERVICE_UNAVAILABLE", message: "" },
      }).message,
    ).toBe("The service is temporarily unavailable. Try again shortly.");
  });

  it.each([
    null,
    undefined,
    "<html>502</html>",
    5,
    [],
    {},
    { error: "text" },
    { error: {} },
  ])("treats a malformed body (%j) as a retryable service error", (body) => {
    const error = apiErrorFromEnvelope(502, body);
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
    expect(error.statusCode).toBe(502);
    expect(error.message).not.toMatch(/html/i);
  });
});

describe("transport and malformed errors", () => {
  it("has a null status and fixed copy for a network failure", () => {
    const error = networkApiError();
    expect(error.statusCode).toBeNull();
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
    expect(error.message).toMatch(/Could not reach the server/);
  });

  it("builds a retryable error for a malformed reply", () => {
    expect(malformedApiError().statusCode).toBeNull();
    expect(malformedApiError(502).statusCode).toBe(502);
  });
});

describe("parsePublicUser", () => {
  it("returns only id, name and email", () => {
    const user = parsePublicUser({
      id: "1",
      name: "Ada",
      email: "ada@example.com",
      access_token: "secret",
      password_hash: "x",
    });
    expect(user).toEqual({ id: "1", name: "Ada", email: "ada@example.com" });
    expect(Object.keys(user).sort()).toEqual(["email", "id", "name"]);
  });

  it.each([
    null,
    "x",
    [],
    { id: 1, name: "a", email: "b" },
    { id: "1", name: "a" },
  ])("rejects a bad shape (%j)", (value) => {
    expect(() => parsePublicUser(value)).toThrow(ApiError);
  });
});

describe("board error codes keep their copy", () => {
  const cases: Array<[string, string, number, string]> = [
    ["NOT_FOUND", "That item was not found.", 404, "Board not found."],
    [
      "USER_NOT_FOUND",
      "No registered user has this email.",
      404,
      "No registered user has this email.",
    ],
    [
      "STATE_CONFLICT",
      "That change conflicts with the current state.",
      409,
      "Already a member.",
    ],
  ];

  it.each(cases)("treats %s as a known code", (code) => {
    expect(isKnownCode(code)).toBe(true);
  });

  it.each(cases)(
    "uses the fixed copy for %s when the server sends no message",
    (code, copy, status) => {
      const error = apiErrorFromEnvelope(status, {
        error: { code, message: "" },
      });
      expect(error.code).toBe(code);
      expect(error.statusCode).toBe(status);
      expect(error.message).toBe(copy);
    },
  );

  it.each(cases)(
    "uses the fixed copy for %s when the message is overlong",
    (code, copy, status) => {
      const error = apiErrorFromEnvelope(status, {
        error: { code, message: "y".repeat(201) },
      });
      expect(error.message).toBe(copy);
    },
  );

  it.each(cases)(
    "keeps the server message for %s when it is present",
    (code, _copy, status, serverText) => {
      const error = apiErrorFromEnvelope(status, {
        error: { code, message: serverText },
      });
      expect(error.message).toBe(serverText);
    },
  );

  it("keeps NOT_FOUND, USER_NOT_FOUND and STATE_CONFLICT envelopes without fields", () => {
    for (const [code, , status] of cases) {
      const error = apiErrorFromEnvelope(status, {
        error: { code, message: "x" },
      });
      expect(error.fields).toBeUndefined();
    }
  });
});
