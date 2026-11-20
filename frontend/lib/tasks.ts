import { titleMatches } from "./cardSearch";
import { malformedApiError } from "./errors";
import { parseCard } from "./kanban";
import type { TaskGroup, TaskItem } from "./types";

// Allowlist parser and grouping for the My Tasks list (E21; Requirements 4.1, 8.3).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTaskItem(value: unknown): TaskItem {
  if (
    !isRecord(value) ||
    typeof value.board_id !== "string" ||
    typeof value.board_name !== "string" ||
    typeof value.column_name !== "string" ||
    typeof value.is_done !== "boolean"
  ) {
    throw malformedApiError();
  }
  // No default for a missing is_done: guessing "open" would show a done task as open (design, Risks).
  return {
    ...parseCard(value),
    board_id: value.board_id,
    board_name: value.board_name,
    column_name: value.column_name,
    is_done: value.is_done,
  };
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

/**
 * Keeps the tasks whose title contains the trimmed query, as the board search does (Rev 2, S14, S15).
 * A blank query returns the list as it is. Title only, a literal substring, and the order is kept.
 */
export function filterTasks(tasks: TaskItem[], query: string): TaskItem[] {
  const q = query.trim();
  return q === "" ? tasks : tasks.filter((task) => titleMatches(task.title, q));
}
