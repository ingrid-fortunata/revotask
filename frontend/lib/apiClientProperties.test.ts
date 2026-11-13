/**
 * Feature: boards-membership, Property 14: Browser client sends only declared requests
 *
 * For a board or user segment, the declared request check and `apiRequest` accept the
 * segment only when it is a canonical UUID. Every other segment throws before `fetch`.
 *
 * **Validates: Requirements 2.6, 7.4, 7.10**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, isDeclaredApiRequest, type ApiMethod } from "./apiClient";

const TAG =
  "Feature: boards-membership, Property 14: Browser client sends only declared requests";

const BOARD_ID = "0f9c4f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const MEMBER_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type Segment = { label: string; value: string; uuid: boolean };

// Fixed table of segments. Only the three UUID rows are canonical. Every other row
// must be refused, including traversal, separators, query and fragment characters.
const SEGMENTS: readonly Segment[] = [
  { label: "lowercase UUID", value: BOARD_ID, uuid: true },
  {
    label: "uppercase UUID",
    value: BOARD_ID.toUpperCase(),
    uuid: true,
  },
  {
    label: "mixed-case UUID",
    value: "0f9C4f2E-1a2B-4c3D-8e4F-5a6B7c8D9e0F",
    uuid: true,
  },
  { label: "empty", value: "", uuid: false },
  { label: "plain word", value: "not-a-uuid", uuid: false },
  { label: "numeric id", value: "1", uuid: false },
  { label: "dot-dot", value: "..", uuid: false },
  { label: "single dot", value: ".", uuid: false },
  { label: "encoded dot-dot", value: "%2e%2e", uuid: false },
  { label: "encoded traversal", value: "..%2F..%2Fsecret", uuid: false },
  { label: "slash", value: "/", uuid: false },
  { label: "embedded slash", value: "a/b", uuid: false },
  { label: "query marker", value: "?", uuid: false },
  { label: "query with value", value: "x?y=1", uuid: false },
  { label: "fragment marker", value: "#", uuid: false },
  { label: "fragment with value", value: "x#y", uuid: false },
  { label: "UUID then slash", value: `${BOARD_ID}/`, uuid: false },
  { label: "UUID then query", value: `${BOARD_ID}?x=1`, uuid: false },
  { label: "UUID then fragment", value: `${BOARD_ID}#x`, uuid: false },
  { label: "UUID then newline", value: `${BOARD_ID}\n`, uuid: false },
  { label: "UUID with leading space", value: ` ${BOARD_ID}`, uuid: false },
  { label: "braced UUID", value: `{${BOARD_ID}}`, uuid: false },
  {
    label: "UUID without hyphens",
    value: BOARD_ID.replaceAll("-", ""),
    uuid: false,
  },
  {
    label: "UUID one digit short",
    value: BOARD_ID.slice(0, -1),
    uuid: false,
  },
  { label: "UUID one digit long", value: `${BOARD_ID}0`, uuid: false },
  {
    label: "non-hex character",
    value: BOARD_ID.replace(/.$/, "g"),
    uuid: false,
  },
];

// Declared method and path templates. The segment fills the board slot or the user slot.
const CASES: ReadonlyArray<{
  name: string;
  method: ApiMethod;
  path: (segment: string) => string;
}> = [
  {
    name: "PATCH board",
    method: "PATCH",
    path: (s) => `/api/boards/${s}`,
  },
  {
    name: "DELETE board",
    method: "DELETE",
    path: (s) => `/api/boards/${s}`,
  },
  {
    name: "POST members",
    method: "POST",
    path: (s) => `/api/boards/${s}/members`,
  },
  {
    name: "DELETE member, board slot",
    method: "DELETE",
    path: (s) => `/api/boards/${s}/members/${MEMBER_ID}`,
  },
  {
    name: "DELETE member, user slot",
    method: "DELETE",
    path: (s) => `/api/boards/${BOARD_ID}/members/${s}`,
  },
];

type Row = [name: string, method: ApiMethod, path: string];

const rows = (uuid: boolean): Row[] =>
  CASES.flatMap((c) =>
    SEGMENTS.filter((seg) => seg.uuid === uuid).map(
      (seg): Row => [`${c.name} with ${seg.label}`, c.method, c.path(seg.value)],
    ),
  );

const REFUSED = rows(false);
const ACCEPTED = rows(true);

describe(TAG, () => {
  it(`${TAG}: the table covers every case and both UUID and non-UUID segments`, () => {
    expect(REFUSED.length).toBe(CASES.length * (SEGMENTS.length - 3));
    expect(ACCEPTED.length).toBe(CASES.length * 3);
  });

  it.each(REFUSED)(
    `${TAG}: refuses %s before fetch`,
    async (_name, method, path) => {
      expect(isDeclaredApiRequest(method, path)).toBe(false);
      await expect(apiRequest(method, path)).rejects.toThrow(/not declared/);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(ACCEPTED)(
    `${TAG}: declares and sends %s`,
    async (_name, method, path) => {
      fetchMock.mockResolvedValue(json(200, { data: null }));
      expect(isDeclaredApiRequest(method, path)).toBe(true);
      await apiRequest(method, path);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(path);
    },
  );
});
