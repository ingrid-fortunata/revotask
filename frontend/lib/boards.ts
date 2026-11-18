import { sprintDayNumber } from "./boardRules";
import { malformedApiError } from "./errors";
import { parseColumnWithCardsList } from "./kanban";
import type { BoardDetail, BoardRole, BoardSummary, Membership } from "./types";

// Allowlist parsers for board and membership payloads (Requirements 7.3, FE-A1).
// Each parser copies only its documented fields and throws ApiError on any other shape.

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is BoardRole {
  return value === "admin" || value === "member";
}

function isVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parseBoardRole(value: unknown): BoardRole {
  if (!isRole(value)) throw malformedApiError();
  return value;
}

// A sprint date is `null` or a real `YYYY-MM-DD` date, and the two dates are both null or both set.
function isSprintDate(value: unknown): value is string | null {
  return value === null || sprintDayNumber(value) !== null;
}

export function parseBoardSummary(value: unknown): BoardSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isRole(value.role) ||
    !isVersion(value.position_version) ||
    !isSprintDate(value.sprint_start) ||
    !isSprintDate(value.sprint_end) ||
    (value.sprint_start === null) !== (value.sprint_end === null)
  ) {
    throw malformedApiError();
  }
  return {
    id: value.id,
    name: value.name,
    role: value.role,
    position_version: value.position_version,
    sprint_start: value.sprint_start,
    sprint_end: value.sprint_end,
  };
}

export function parseBoardSummaryList(value: unknown): BoardSummary[] {
  if (!Array.isArray(value)) throw malformedApiError();
  return value.map(parseBoardSummary);
}

export function parseMembership(value: unknown): Membership {
  if (
    !isRecord(value) ||
    typeof value.user_id !== "string" ||
    typeof value.name !== "string" ||
    !isRole(value.role)
  ) {
    throw malformedApiError();
  }
  return { user_id: value.user_id, name: value.name, role: value.role };
}

export function parseMembershipList(value: unknown): Membership[] {
  if (!Array.isArray(value)) throw malformedApiError();
  return value.map(parseMembership);
}

export function parseBoardDetail(value: unknown): BoardDetail {
  if (!isRecord(value)) throw malformedApiError();
  const summary = parseBoardSummary(value);
  return { ...summary, columns: parseColumnWithCardsList(value.columns) };
}
