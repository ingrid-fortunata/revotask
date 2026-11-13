/**
 * Feature: comments, Property 12: Browser client sends only declared requests
 *
 * The comment paths are declared for their own methods only, a non-UUID segment throws before
 * `fetch`, and the GET allowlist gains the card's comments and nothing else.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiRequest, isDeclaredApiGet, isDeclaredApiRequest, type ApiMethod } from "./apiClient";

const A = "0f9c4f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const DECLARED: [ApiMethod, (id: string) => string][] = [
  ["POST", (id) => `/api/cards/${id}/comments`],
  ["PATCH", (id) => `/api/comments/${id}`],
  ["DELETE", (id) => `/api/comments/${id}`],
];

const BAD_SEGMENTS = ["", "..", "a/b", "x?y=1", "x#y", "%2e%2e", "not-a-uuid", `${A}/../x`, `${A} `];

describe("Feature: comments, Property 12: declared comment requests", () => {
  it.each(DECLARED)("declares %s for its path", (method, path) => {
    expect(isDeclaredApiRequest(method, path(A))).toBe(true);
  });

  it.each(DECLARED)("refuses a non-UUID segment for %s", async (method, path) => {
    for (const segment of BAD_SEGMENTS) {
      expect(isDeclaredApiRequest(method, path(segment))).toBe(false);
      await expect(apiRequest(method, path(segment), {})).rejects.toThrow(/not declared/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses the other methods on each comment path", () => {
    const methods: ApiMethod[] = ["POST", "PATCH", "DELETE"];
    for (const [, path] of DECLARED) {
      const allowed = DECLARED.filter(([, other]) => other(A) === path(A)).map(([m]) => m);
      for (const method of methods) {
        expect(isDeclaredApiRequest(method, path(A))).toBe(allowed.includes(method));
      }
    }
  });

  it("refuses undeclared comment-like paths", () => {
    for (const path of [
      `/api/comments/${A}/comments`,
      `/api/comments`,
      `/api/cards/${A}/comments/${A}`,
      `/api/cards/${A}/comment`,
    ]) {
      for (const method of ["POST", "PATCH", "DELETE"] as ApiMethod[]) {
        expect(isDeclaredApiRequest(method, path)).toBe(false);
      }
    }
  });

  it("declares GET for a card's comments only", () => {
    expect(isDeclaredApiGet(`/api/cards/${A}/comments`)).toBe(true);
    for (const path of [`/api/comments/${A}`, `/api/cards/${A}`, `/api/cards/bad/comments`, `/api/cards/${A}/comments?x=1`]) {
      expect(isDeclaredApiGet(path)).toBe(false);
    }
  });

  it("throws before fetch for an undeclared GET and sends a declared one", async () => {
    await expect(apiGet(`/api/cards/bad/comments`)).rejects.toThrow(/not declared/);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(json(200, { data: [] }));
    await expect(apiGet(`/api/cards/${A}/comments`)).resolves.toEqual([]);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe(`/api/cards/${A}/comments`);
    expect(init.method).toBe("GET");
  });
});
