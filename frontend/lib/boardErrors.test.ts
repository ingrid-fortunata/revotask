import { describe, expect, it } from "vitest";
import {
  isBoardAccessError,
  isInvalidDestination,
  isPositionConflict,
  isStateConflict,
  isUncertainOutcome,
} from "./boardErrors";
import { ApiError } from "./errors";

const err = (statusCode: number | null, code: string, fields?: Record<string, string>) =>
  new ApiError({ statusCode, code, message: "m", fields });

describe("kanban error classification", () => {
  it("tells a position conflict from a state conflict", () => {
    expect(isPositionConflict(err(409, "POSITION_CONFLICT"))).toBe(true);
    expect(isPositionConflict(err(409, "STATE_CONFLICT"))).toBe(false);
    expect(isStateConflict(err(409, "STATE_CONFLICT"))).toBe(true);
    expect(isStateConflict(err(409, "POSITION_CONFLICT"))).toBe(false);
    expect(isPositionConflict(new Error("x"))).toBe(false);
  });

  it("treats a 400 without fields as an invalid destination and a 400 with fields as a form error", () => {
    expect(isInvalidDestination(err(400, "VALIDATION_ERROR"))).toBe(true);
    expect(isInvalidDestination(err(400, "VALIDATION_ERROR", { title: "x" }))).toBe(false);
    expect(isInvalidDestination(err(404, "NOT_FOUND"))).toBe(false);
  });

  it("treats a 5xx, a transport failure and a non-ApiError as an uncertain outcome", () => {
    expect(isUncertainOutcome(err(500, "INTERNAL_ERROR"))).toBe(true);
    expect(isUncertainOutcome(err(503, "SERVICE_UNAVAILABLE"))).toBe(true);
    expect(isUncertainOutcome(err(null, "SERVICE_UNAVAILABLE"))).toBe(true);
    expect(isUncertainOutcome(new TypeError("x"))).toBe(true);
    expect(isUncertainOutcome(err(409, "POSITION_CONFLICT"))).toBe(false);
    expect(isUncertainOutcome(err(403, "FORBIDDEN"))).toBe(false);
  });

  it("keeps the board access check unchanged", () => {
    expect(isBoardAccessError(err(404, "NOT_FOUND"))).toBe(true);
    expect(isBoardAccessError(err(404, "USER_NOT_FOUND"))).toBe(false);
  });
});
