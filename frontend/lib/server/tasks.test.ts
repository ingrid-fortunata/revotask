// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../errors";

const fetchPrivate = vi.fn();
vi.mock("./session", () => ({ fetchPrivate: (...args: unknown[]) => fetchPrivate(...args) }));

import { getMyTasks } from "./tasks";

const task = {
  id: "a",
  column_id: "c",
  title: "T",
  description: null,
  assignee_id: "me",
  assignee_name: "Me",
  order: 1,
  board_id: "b",
  board_name: "Board",
  column_name: "To do",
  is_done: false,
};

beforeEach(() => fetchPrivate.mockReset());

describe("getMyTasks", () => {
  it("reads the fixed route with the fixed query and returns the parsed list", async () => {
    fetchPrivate.mockResolvedValue({ status: 200, body: { data: [{ ...task, extra: "x" }] }, retryAfter: null });
    const tasks = await getMyTasks();
    expect(fetchPrivate).toHaveBeenCalledWith("myTasks", { method: "GET", search: "?assignee=me" });
    expect(tasks).toEqual([task]);
  });

  it.each(["column_name", "is_done"])("throws an ApiError when an item lacks %s (Rev 2)", async (key) => {
    const { [key as "column_name"]: _omitted, ...rest } = task;
    void _omitted;
    fetchPrivate.mockResolvedValue({ status: 200, body: { data: [rest] }, retryAfter: null });
    await expect(getMyTasks()).rejects.toBeInstanceOf(ApiError);
  });

  it("returns an empty list", async () => {
    fetchPrivate.mockResolvedValue({ status: 200, body: { data: [] }, retryAfter: null });
    expect(await getMyTasks()).toEqual([]);
  });

  it.each([500, 503, 400])("throws an ApiError for status %i", async (status) => {
    fetchPrivate.mockResolvedValue({ status, body: { error: { code: "X", message: "m" } }, retryAfter: null });
    await expect(getMyTasks()).rejects.toBeInstanceOf(ApiError);
  });

  it.each([{ nope: 1 }, null, { data: "x" }])("throws for a malformed body %j", async (body) => {
    fetchPrivate.mockResolvedValue({ status: 200, body, retryAfter: null });
    await expect(getMyTasks()).rejects.toBeInstanceOf(ApiError);
  });
});
