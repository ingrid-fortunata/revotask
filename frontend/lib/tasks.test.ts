import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { filterTasks, groupTasksByBoard, parseTaskItem, parseTaskList } from "./tasks";
import type { TaskItem } from "./types";

const item = (id: string, boardId: string, boardName: string, over: Partial<TaskItem> = {}): TaskItem => ({
  id,
  column_id: "c1",
  title: `Task ${id}`,
  description: null,
  assignee_id: "me",
  assignee_name: "Me",
  order: 1024,
  board_id: boardId,
  board_name: boardName,
  column_name: "To do",
  is_done: false,
  ...over,
});

describe("parseTaskList", () => {
  it("copies only the documented fields", () => {
    const [parsed] = parseTaskList([{ ...item("a", "b1", "Alpha"), secret: "x", email: "e@x.test" }]);
    expect(parsed).toEqual(item("a", "b1", "Alpha"));
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(item("a", "b1", "Alpha")).sort());
  });

  it("accepts an empty list", () => {
    expect(parseTaskList([])).toEqual([]);
  });

  it.each([null, {}, "x", [null], [{ ...item("a", "b", "B"), board_id: 1 }], [{ ...item("a", "b", "B"), board_name: undefined }]])(
    "throws an ApiError for %j",
    (value) => {
      expect(() => parseTaskList(value)).toThrow(ApiError);
    },
  );

  it("copies column_name and is_done (Rev 2)", () => {
    const [done] = parseTaskList([item("a", "b1", "Alpha", { column_name: "Selesai", is_done: true })]);
    expect(done.column_name).toBe("Selesai");
    expect(done.is_done).toBe(true);
  });

  it.each([
    ["a missing column_name", { column_name: undefined }],
    ["a non-string column_name", { column_name: 3 }],
    ["a missing is_done", { is_done: undefined }],
    ["the string 'true' as is_done", { is_done: "true" }],
    ["the string 'false' as is_done", { is_done: "false" }],
    ["null as is_done", { is_done: null }],
  ])("throws an ApiError for %s and never defaults the status", (_name, over) => {
    expect(() => parseTaskItem({ ...item("a", "b", "B"), ...over })).toThrow(ApiError);
  });

  it("parseTaskItem rejects a missing card order", () => {
    expect(() => parseTaskItem({ ...item("a", "b", "B"), order: "x" })).toThrow(ApiError);
  });
});

describe("groupTasksByBoard", () => {
  it("returns no groups for no tasks", () => {
    expect(groupTasksByBoard([])).toEqual([]);
  });

  it("groups by board in order of first appearance and keeps the task order", () => {
    const tasks = [
      item("1", "b2", "Beta"),
      item("2", "b2", "Beta"),
      item("3", "b1", "Alpha"),
      item("4", "b2", "Beta"),
    ];
    const groups = groupTasksByBoard(tasks);
    expect(groups.map((group) => [group.boardId, group.boardName])).toEqual([
      ["b2", "Beta"],
      ["b1", "Alpha"],
    ]);
    expect(groups[0].tasks.map((task) => task.id)).toEqual(["1", "2", "4"]);
    expect(groups[1].tasks.map((task) => task.id)).toEqual(["3"]);
  });
});

describe("filterTasks (Rev 2, Property 14)", () => {
  const tasks = [
    item("1", "b1", "Alpha", { title: "Write Report", description: "quarterly numbers" }),
    item("2", "b1", "Alpha", { title: "Fix 50% bug" }),
    item("3", "b2", "Beta", { title: "a_b c" }),
    item("4", "b2", "Beta", { title: "Path C:\\temp * file." }),
    item("5", "b2", "Beta", { title: "Other", column_name: "Report" }),
  ];
  const ids = (list: TaskItem[]) => list.map((task) => task.id);

  it.each(["", "   ", "\t\n"])("returns the same list for a blank query %j", (query) => {
    expect(filterTasks(tasks, query)).toBe(tasks);
  });

  it("matches case-insensitively and trims the query", () => {
    expect(ids(filterTasks(tasks, "  rEpOrT "))).toEqual(["1"]);
  });

  it.each([
    ["%", ["2"]],
    ["_", ["3"]],
    ["\\", ["4"]],
    ["*", ["4"]],
    [".", ["4"]],
    ["50%", ["2"]],
  ])("treats %j as literal text", (query, expected) => {
    expect(ids(filterTasks(tasks, query))).toEqual(expected);
  });

  it("matches the title only, never the description, the board name or the column name", () => {
    expect(filterTasks(tasks, "quarterly")).toEqual([]);
    expect(filterTasks(tasks, "Beta")).toEqual([]);
    expect(ids(filterTasks(tasks, "Report"))).toEqual(["1"]);
  });

  it("keeps the input order and returns an empty list for no match", () => {
    expect(ids(filterTasks(tasks, "b"))).toEqual(["2", "3"]);
    expect(filterTasks(tasks, "zzz")).toEqual([]);
  });
});
