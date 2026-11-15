import { dataOf, flask } from "./api";

// Seeding through the API (E06, E11, E13, E17, E07). Used for fixtures that are not the object of
// the test. Shapes follow docs/API.md; the first live run confirms them.

export type Board = { id: string; position_version: number; columns: { id: string; name: string; cards: { id: string; title: string; column_id: string }[] }[] };

function must<T>(reply: { status: number; json: unknown }, expected: number, what: string): T {
  if (reply.status !== expected) throw new Error(`${what} returned ${reply.status}, expected ${expected}`);
  return dataOf<T>(reply.json);
}

export async function createBoard(token: string, name: string): Promise<string> {
  const data = must<{ id: string }>(await flask("POST", "/api/boards", { token, body: { name } }), 201, "E06");
  return data.id;
}

export async function addColumn(token: string, boardId: string, name: string): Promise<string> {
  const data = must<{ column: { id: string } }>(
    await flask("POST", `/api/boards/${boardId}/columns`, { token, body: { name } }),
    201,
    "E13",
  );
  return data.column.id;
}

export async function addCard(token: string, columnId: string, title: string, assigneeId?: string): Promise<string> {
  const body: Record<string, unknown> = { title };
  if (assigneeId) body.assignee_id = assigneeId;
  const data = must<{ card: { id: string } }>(
    await flask("POST", `/api/columns/${columnId}/cards`, { token, body }),
    201,
    "E17",
  );
  return data.card.id;
}

export async function addMember(token: string, boardId: string, email: string): Promise<void> {
  must(await flask("POST", `/api/boards/${boardId}/members`, { token, body: { email } }), 201, "E11");
}

export async function getBoard(token: string, boardId: string): Promise<Board> {
  return must<Board>(await flask("GET", `/api/boards/${boardId}`, { token }), 200, "E07");
}

export function cardColumn(board: Board, title: string): string | undefined {
  for (const column of board.columns) {
    if (column.cards.some((c) => c.title === title)) return column.name;
  }
  return undefined;
}

export function columnIdByName(board: Board, name: string): string {
  const column = board.columns.find((c) => c.name === name);
  if (!column) throw new Error(`column ${name} not found`);
  return column.id;
}

export async function boardIdByName(token: string, name: string): Promise<string> {
  const reply = await flask("GET", "/api/boards", { token });
  const found = (dataOf<{ id: string; name: string }[]>(reply.json) ?? []).find((b) => b.name === name);
  if (!found) throw new Error(`board ${name} not found`);
  return found.id;
}
