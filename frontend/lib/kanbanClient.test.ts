/**
 * Feature: kanban, Property 17: Browser client sends only declared requests
 *
 * The kanban paths are declared for their own methods only, a non-UUID segment throws before
 * `fetch`, and the GET allowlist covers the board and its members and nothing else.
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
  ["POST", (id) => `/api/boards/${id}/columns`],
  ["PATCH", (id) => `/api/boards/${id}/columns/reorder`],
  ["PATCH", (id) => `/api/columns/${id}`],
  ["DELETE", (id) => `/api/columns/${id}`],
  ["POST", (id) => `/api/columns/${id}/cards`],
  ["PATCH", (id) => `/api/cards/${id}`],
  ["DELETE", (id) => `/api/cards/${id}`],
  ["PATCH", (id) => `/api/cards/${id}/position`],
];

const BAD_SEGMENTS = ["", "..", "a/b", "x?y=1", "x#y", "%2e%2e", "not-a-uuid", `${A}/../x`, `${A} `];

describe("Feature: kanban, Property 17: declared kanban requests", () => {
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

  it("refuses the other methods on each kanban path", () => {
    const methods: ApiMethod[] = ["POST", "PATCH", "DELETE"];
    for (const [declaredMethod, path] of DECLARED) {
      const allowed = DECLARED.filter(([, other]) => other(A) === path(A)).map(([m]) => m);
      for (const method of methods) {
        expect(isDeclaredApiRequest(method, path(A))).toBe(allowed.includes(method));
      }
      expect(declaredMethod).toBeTruthy();
    }
  });

  it("refuses undeclared kanban-like paths", () => {
    for (const path of [
      `/api/columns/${A}/cards/${A}`,
      `/api/cards/${A}/comments`,
      `/api/cards?assignee=me`,
      `/api/boards/${A}/columns/${A}`,
      `/api/boards/${A}/cards/search`,
    ]) {
      for (const method of ["POST", "PATCH", "DELETE"] as ApiMethod[]) {
        expect(isDeclaredApiRequest(method, path)).toBe(false);
      }
    }
  });

  it("sends a declared kanban request and unwraps data", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { position_version: 4 } }));
    expect(await apiRequest("DELETE", `/api/cards/${A}`)).toEqual({ position_version: 4 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/cards/${A}`);
    expect(init.method).toBe("DELETE");
    expect(init.credentials).toBe("same-origin");
  });
});

describe("Feature: kanban, Property 17: declared browser reads", () => {
  it("declares only the board and its members", () => {
    expect(isDeclaredApiGet(`/api/boards/${A}`)).toBe(true);
    expect(isDeclaredApiGet(`/api/boards/${A}/members`)).toBe(true);
    for (const path of [
      "/api/boards",
      `/api/boards/${A}/columns`,
      `/api/boards/${A}/members/${A}`,
      `/api/cards/${A}`,
      `/api/users/me`,
      `/api/boards/${A}?x=1`,
      `/api/boards/..`,
    ]) {
      expect(isDeclaredApiGet(path)).toBe(false);
    }
  });

  it("throws before fetch for an undeclared or non-UUID path", async () => {
    for (const path of ["/api/boards", "/api/boards/nope", `/api/boards/${A}/x`, "https://evil.example/"]) {
      await expect(apiGet(path)).rejects.toThrow(/not declared/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a GET without a body and unwraps data", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { id: A } }));
    expect(await apiGet(`/api/boards/${A}`)).toEqual({ id: A });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/boards/${A}`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.cache).toBe("no-store");
  });

  it("throws an ApiError for a non-2xx reply", async () => {
    fetchMock.mockResolvedValue(json(404, { error: { code: "NOT_FOUND", message: "Resource not found." } }));
    await expect(apiGet(`/api/boards/${A}`)).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });
});
