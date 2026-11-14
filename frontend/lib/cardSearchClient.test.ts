import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, isDeclaredApiGet } from "./apiClient";
import { cardSearchPath } from "./cardSearch";

const A = "0f9c4f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("browser client: the search path", () => {
  it("declares the one search path with exactly one q", () => {
    expect(isDeclaredApiGet(`/api/boards/${A}/cards/search?q=report`)).toBe(true);
    expect(isDeclaredApiGet(cardSearchPath(A, "a&b # 50%"))).toBe(true);
    expect(isDeclaredApiGet(`/api/boards/${A}/cards/search?q=`)).toBe(true);
  });

  it.each([
    `/api/boards/${A}/cards/search`,
    `/api/boards/${A}/cards/search?`,
    `/api/boards/${A}/cards/search?q=a&q=b`,
    `/api/boards/${A}/cards/search?q=a&foo=1`,
    `/api/boards/${A}/cards/search?foo=1`,
    `/api/boards/${A}/cards/search?q=a#frag`,
    `/api/boards/${A}/cards/search/extra?q=a`,
    `/api/boards/not-a-uuid/cards/search?q=a`,
    `/api/boards/${A}/../cards/search?q=a`,
    `/api/boards/${A}/cards?q=a`,
    `https://evil.example/api/boards/${A}/cards/search?q=a`,
  ])("refuses %s before fetch", async (path) => {
    expect(isDeclaredApiGet(path)).toBe(false);
    await expect(apiGet(path)).rejects.toThrow(/not declared/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the declared path as a same-origin GET and returns the unwrapped data", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "x" }] }), { status: 200 }));
    const path = cardSearchPath(A, "report");
    expect(await apiGet(path)).toEqual([{ id: "x" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(path);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
  });
});
