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
  /** The optional sprint, `YYYY-MM-DD`. Both dates or neither (docs/API.md C39). */
  sprint_start: string | null;
  sprint_end: string | null;
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

// Comment shape from docs/API.md. `author_name` is the author's current name.
export type Comment = {
  id: string;
  card_id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
  updated_at: string;
};

// My Tasks and card search shapes from docs/API.md (E21 item, E22 item).
export type TaskItem = Card & { board_id: string; board_name: string };
export type TaskGroup = { boardId: string; boardName: string; tasks: TaskItem[] };
export type SearchResult = { id: string; title: string; column_id: string };
/** The held E22 response: the trimmed query it answered and the items exactly as returned. */
export type HeldSearch = { query: string; items: SearchResult[] };
/** A result as shown: the card's current title and its current column name. */
export type VisibleResult = { cardId: string; title: string; columnName: string };

// Board analytics shape from docs/API.md (E29). `week_end` is exclusive, and the window is the board's sprint or the UTC week. Counts are whole numbers.
export type ColumnCount = { column_id: string; name: string; count: number };
export type ActivityCount = { user_id: string; name: string; count: number };
export type BoardAnalytics = {
  week_start: string;
  week_end: string;
  /** `"sprint"` when the window is the board's sprint, `"week"` for the UTC week (C40). */
  window: "sprint" | "week";
  cards_per_column: ColumnCount[];
  completed_cards: number;
  member_activity: ActivityCount[];
};

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

// Notification shapes from docs/API.md (E27 item and page, E28 item). The display fields are the
// current names resolved by Flask for visible rows only. Named `NotificationItem` so it does not
// shadow the browser's `Notification` global.
export type NotificationKind = "assigned" | "commented";
export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  board_id: string;
  card_id: string;
  actor_id: string;
  actor_name: string;
  board_name: string;
  card_title: string;
  created_at: string;
  read_at: string | null;
};
export type NotificationPage = {
  items: NotificationItem[];
  page: number;
  per_page: number;
  total: number;
  unread_count: number;
};
