import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { groupTasksByBoard, parseTaskItem, parseTaskList } from "./tasks";
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
