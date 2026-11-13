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

// Columns are typed fully in the board-columns slice (T07–T08).
export type BoardDetail = BoardSummary & { columns: unknown[] };

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
