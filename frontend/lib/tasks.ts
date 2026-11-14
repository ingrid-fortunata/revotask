import { malformedApiError } from "./errors";
import { parseCard } from "./kanban";
import type { TaskGroup, TaskItem } from "./types";

// Allowlist parser and grouping for the My Tasks list (E21; Requirements 4.1, 8.3).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTaskItem(value: unknown): TaskItem {
  if (!isRecord(value) || typeof value.board_id !== "string" || typeof value.board_name !== "string") {
    throw malformedApiError();
  }
  return { ...parseCard(value), board_id: value.board_id, board_name: value.board_name };
}

export function parseTaskList(value: unknown): TaskItem[] {
  if (!Array.isArray(value)) throw malformedApiError();
  return value.map(parseTaskItem);
}

/** Groups by board in order of first appearance, so the API order (S1) is kept. */
export function groupTasksByBoard(tasks: TaskItem[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  for (const task of tasks) {
    const group = groups.get(task.board_id);
    if (group) group.tasks.push(task);
    else groups.set(task.board_id, { boardId: task.board_id, boardName: task.board_name, tasks: [task] });
  }
  return [...groups.values()];
}
