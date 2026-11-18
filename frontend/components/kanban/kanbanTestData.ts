import type { Card, ColumnWithCards, Membership } from "@/lib/types";

// Fixed data for the kanban component tests. Not imported by application code.
export const BOARD_ID = "b0000000-0000-4000-8000-000000000000";

export function card(id: string, columnId: string, order: number, over: Partial<Card> = {}): Card {
  return {
    id,
    column_id: columnId,
    title: `Card ${id}`,
    description: null,
    assignee_id: null,
    assignee_name: null,
    order,
    ...over,
  };
}

export function column(id: string, order: number, cards: Card[], over: Partial<ColumnWithCards> = {}): ColumnWithCards {
  return { id, board_id: BOARD_ID, name: `Col ${id}`, is_done: false, order, cards, ...over };
}

export const MEMBERS: Membership[] = [
  { user_id: "u-ada", name: "Ada", role: "admin" },
  { user_id: "u-grace", name: "Grace", role: "member" },
];

export const board = (): ColumnWithCards[] => [
  column("todo", 1024, [card("a", "todo", 1024), card("b", "todo", 2048, { assignee_id: "u-grace", assignee_name: "Grace" })]),
  column("doing", 2048, [card("d", "doing", 1024)]),
  column("done", 3072, [], { is_done: true }),
];

export const detail = (columns: ColumnWithCards[], version: number) => ({
  id: BOARD_ID,
  name: "Board",
  role: "admin",
  position_version: version,
  sprint_start: null,
  sprint_end: null,
  columns,
});
