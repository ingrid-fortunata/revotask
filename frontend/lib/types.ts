// Public shapes shared by server and browser code. The user is an allowlist: id, name, email.
export type PublicUser = {
  id: string;
  name: string;
  email: string;
};

// Board shapes from docs/API.md (BoardSummary, BoardDetail, Membership).
export type BoardRole = "admin" | "member";

export type BoardSummary = {
  id: string;
  name: string;
  role: BoardRole;
  position_version: number;
};

// Kanban shapes from docs/API.md (Card, Column, ColumnWithCards, BoardDetail).
export type Card = {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  order: number;
};

export type Column = {
  id: string;
  board_id: string;
  name: string;
  is_done: boolean;
  order: number;
};

export type ColumnWithCards = Column & { cards: Card[] };

export type BoardDetail = BoardSummary & { columns: ColumnWithCards[] };

export type Membership = {
  user_id: string;
  name: string;
  role: BoardRole;
};

export type SuccessEnvelope<T> = { data: T };

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    request_id?: string;
    fields?: Record<string, string>;
  };
};
