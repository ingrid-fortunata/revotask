import { describe, expect, it } from "vitest";
import { ApiError, apiErrorFromEnvelope } from "./errors";
import {
  parseBoardDetail,
  parseBoardRole,
  parseBoardSummary,
  parseBoardSummaryList,
  parseMembership,
  parseMembershipList,
} from "./boards";

const summary = { id: "b1", name: "Roadmap", role: "admin", position_version: 3 };
const member = { user_id: "u1", name: "Ada", role: "member" };

describe("board error codes", () => {
  it.each(["NOT_FOUND", "USER_NOT_FOUND", "STATE_CONFLICT"])(
    "keeps the server message for %s",
    (code) => {
      const error = apiErrorFromEnvelope(404, {
        error: { code, message: "Server wording for this error." },
      });
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe(code);
      expect(error.message).toBe("Server wording for this error.");
    },
  );

  it.each([
    ["NOT_FOUND", "That item was not found."],
    ["USER_NOT_FOUND", "No registered user has this email."],
    ["STATE_CONFLICT", "That change conflicts with the current state."],
  ])("uses fallback copy for %s when the message is missing", (code, copy) => {
    const error = apiErrorFromEnvelope(404, { error: { code, message: "" } });
    expect(error.message).toBe(copy);
  });

  it("replaces the message of an unknown code with generic copy", () => {
    const error = apiErrorFromEnvelope(500, {
      error: { code: "UNLISTED_CODE", message: "internal detail" },
    });
    expect(error.message).toBe("Something went wrong. Try again.");
  });
});

describe("parseBoardRole", () => {
  it("accepts admin and member", () => {
    expect(parseBoardRole("admin")).toBe("admin");
    expect(parseBoardRole("member")).toBe("member");
  });

  it.each(["owner", "Admin", "", null, 1])("rejects %j", (value) => {
    expect(() => parseBoardRole(value)).toThrow(ApiError);
  });
});

describe("parseBoardSummary", () => {
  it("returns the documented fields only", () => {
    const parsed = parseBoardSummary({ ...summary, created_at: "2024-01-01", extra: true });
    expect(parsed).toEqual(summary);
  });

  it("accepts position_version 0", () => {
    expect(parseBoardSummary({ ...summary, position_version: 0 }).position_version).toBe(0);
  });

  it.each([
    ["missing id", { ...summary, id: undefined }],
    ["non-string name", { ...summary, name: 5 }],
    ["unknown role", { ...summary, role: "owner" }],
    ["negative version", { ...summary, position_version: -1 }],
    ["fractional version", { ...summary, position_version: 1.5 }],
    ["string version", { ...summary, position_version: "3" }],
    ["array", [summary]],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(() => parseBoardSummary(value)).toThrow(ApiError);
  });
});

describe("parseBoardSummaryList", () => {
  it("parses each item", () => {
    expect(parseBoardSummaryList([summary])).toEqual([summary]);
  });

  it("rejects a non-array and an invalid item", () => {
    expect(() => parseBoardSummaryList({ data: [] })).toThrow(ApiError);
    expect(() => parseBoardSummaryList([summary, { id: "x" }])).toThrow(ApiError);
  });
});

describe("parseMembership", () => {
  it("drops email, hash and timestamps", () => {
    const parsed = parseMembership({
      ...member,
      email: "ada@example.com",
      password_hash: "secret",
      created_at: "2024-01-01",
    });
    expect(parsed).toEqual(member);
    expect(Object.keys(parsed).sort()).toEqual(["name", "role", "user_id"]);
  });

  it.each([
    ["missing user_id", { ...member, user_id: undefined }],
    ["non-string name", { ...member, name: null }],
    ["unknown role", { ...member, role: "guest" }],
  ])("rejects %s", (_label, value) => {
    expect(() => parseMembership(value)).toThrow(ApiError);
  });
});

describe("parseMembershipList", () => {
  it("keeps the server order", () => {
    const second = { user_id: "u2", name: "Bo", role: "member" };
    expect(parseMembershipList([member, second])).toEqual([member, second]);
  });

  it("rejects a non-array", () => {
    expect(() => parseMembershipList(member)).toThrow(ApiError);
  });
});

describe("parseBoardDetail", () => {
  it("keeps the summary fields and the columns array", () => {
    const columns = [{ id: "c1", board_id: "b1", name: "To do", is_done: false, order: 0 }];
    const parsed = parseBoardDetail({ ...summary, columns, extra: 1 });
    expect(parsed).toEqual({ ...summary, columns });
  });

  it("rejects a detail without a columns array", () => {
    expect(() => parseBoardDetail(summary)).toThrow(ApiError);
    expect(() => parseBoardDetail({ ...summary, columns: {} })).toThrow(ApiError);
  });
});
