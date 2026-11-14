import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiRequest } from "@/lib/apiClient";
import { BOARD_ACCESS_MESSAGE } from "@/lib/boardErrors";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import type { BoardSummary, ColumnWithCards, Membership } from "@/lib/types";
import { BoardShell } from "./BoardShell";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn(), apiGet: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const ADA_ID = "22222222-2222-4222-8222-222222222222";
const BEN_ID = "33333333-3333-4333-8333-333333333333";

const ADMIN_BOARD: BoardSummary = {
  id: BOARD_ID,
  name: "Alpha",
  role: "admin",
  position_version: 0,
};
const MEMBER_BOARD: BoardSummary = { ...ADMIN_BOARD, role: "member" };
const MEMBERS: Membership[] = [
  { user_id: ADA_ID, name: "Ada", role: "admin" },
  { user_id: BEN_ID, name: "Ben", role: "member" },
];

// The analytics panel reads E29 through apiGet too. These helpers keep the board and search
// reads separate from it, so the older tests still count only their own requests.
const ANALYTICS = {
  week_start: "2026-11-09T00:00:00Z",
  week_end: "2026-11-16T00:00:00Z",
  cards_per_column: [],
  completed_cards: 0,
  member_activity: [],
};
const isAnalytics = (path: unknown) => String(path).endsWith("/analytics");
function mockGets(others: (path: string) => unknown, analytics: () => unknown = () => ANALYTICS) {
  vi.mocked(apiGet).mockImplementation(async (path: string) =>
    isAnalytics(path) ? analytics() : others(path),
  );
}
const otherGets = () => vi.mocked(apiGet).mock.calls.filter(([path]) => !isAnalytics(path));
const analyticsGets = () => vi.mocked(apiGet).mock.calls.filter(([path]) => isAnalytics(path));

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiGet).mockReset();
  mockGets(() => undefined);
  vi.mocked(notifyError).mockReset();
});

function renderShell(board: BoardSummary, columns: ColumnWithCards[] = []) {
  render(<BoardShell board={board} columns={columns} members={MEMBERS} />);
}

// The board header block that holds the name and the role badge.
function headerOf(): HTMLElement {
  return screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
}

function deleteDialog() {
  return screen.getByRole("dialog", { name: "Delete board?" });
}

describe("BoardShell layout (Requirement 2.7)", () => {
  it("shows the name header, role badge, members panel and the Kanban columns area", () => {
    renderShell(ADMIN_BOARD);
    expect(
      screen.getByRole("heading", { level: 1, name: "Alpha" }),
    ).toBeInTheDocument();
    expect(within(headerOf()).getByText("Admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Members (${MEMBERS.length})` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add member" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Columns" })).toBeInTheDocument();
    expect(screen.getByText("Add your first column")).toBeInTheDocument();
  });

  it("shows the board's columns and cards from the server read", () => {
    renderShell(ADMIN_BOARD, [
      {
        id: "c1",
        board_id: BOARD_ID,
        name: "To do",
        is_done: false,
        order: 1024,
        cards: [
          { id: "k1", column_id: "c1", title: "Write spec", description: null, assignee_id: null, assignee_name: null, order: 1024 },
        ],
      },
    ]);
    expect(screen.getByRole("region", { name: "To do" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Write spec" })).toBeInTheDocument();
  });
});

describe("BoardShell member view (Requirement 3.10)", () => {
  it("hides the rename and delete controls from a member", () => {
    renderShell(MEMBER_BOARD);
    expect(within(headerOf()).getByText("Member")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rename board" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete board" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Delete board?" }),
    ).not.toBeInTheDocument();
  });
});

describe("BoardShell rename (Requirements 3.7, 2.10)", () => {
  it("opens the rename form, shows the new name in the header and returns focus to Rename", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...ADMIN_BOARD, name: "Bravo" });
    renderShell(ADMIN_BOARD);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rename board" }));
    const form = screen.getByRole("form", { name: "Rename board" });
    const input = within(form).getByLabelText("Board name");
    await user.clear(input);
    await user.type(input, "Bravo");
    await user.click(within(form).getByRole("button", { name: "Save name" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Bravo" }),
      ).toBeInTheDocument(),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "PATCH",
      `/api/boards/${BOARD_ID}`,
      { name: "Bravo" },
    );
    expect(
      screen.queryByRole("form", { name: "Rename board" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename board" })).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it("closes the rename form on Cancel, keeps the name and returns focus to Rename", async () => {
    renderShell(ADMIN_BOARD);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rename board" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("form", { name: "Rename board" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Alpha" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename board" })).toHaveFocus();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("shows the access error and navigates to / when E08 returns a board-access 404", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 404,
        code: "NOT_FOUND",
        message: "That item was not found.",
      }),
    );
    renderShell(ADMIN_BOARD);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rename board" }));
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/"));
    expect(notifyError).toHaveBeenCalledWith(BOARD_ACCESS_MESSAGE);
  });
});

describe("BoardShell delete (Requirements 3.8, 3.9, 2.10)", () => {
  it("opens the confirm dialog naming the board, with Cancel and Confirm", async () => {
    renderShell(ADMIN_BOARD);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Delete board" }));
    const dialog = deleteDialog();
    expect(
      within(dialog).getByText(
        'Delete "Alpha"? Members will lose access to it.',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Delete board" }),
    ).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("closes on Cancel without calling the API and returns focus to Delete board", async () => {
    renderShell(ADMIN_BOARD);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    await user.click(
      within(deleteDialog()).getByRole("button", { name: "Cancel" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Delete board?" }),
    ).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete board" })).toHaveFocus();
  });

  it("sends E09 on Confirm and navigates to the dashboard", async () => {
    vi.mocked(apiRequest).mockResolvedValue(null);
    renderShell(ADMIN_BOARD);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    await user.click(
      within(deleteDialog()).getByRole("button", { name: "Delete board" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/"));
    expect(apiRequest).toHaveBeenCalledWith(
      "DELETE",
      `/api/boards/${BOARD_ID}`,
    );
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("shows the access error and navigates to / when E09 returns a board-access 404", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 404,
        code: "NOT_FOUND",
        message: "That item was not found.",
      }),
    );
    renderShell(ADMIN_BOARD);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    await user.click(
      within(deleteDialog()).getByRole("button", { name: "Delete board" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/"));
    expect(notifyError).toHaveBeenCalledWith(BOARD_ACCESS_MESSAGE);
  });

  it("closes the dialog and refreshes the route when E09 returns 403", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "This request was not allowed.",
      }),
    );
    renderShell(ADMIN_BOARD);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    await user.click(
      within(deleteDialog()).getByRole("button", { name: "Delete board" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("dialog", { name: "Delete board?" }),
    ).not.toBeInTheDocument();
    expect(notifyError).toHaveBeenCalledWith("This request was not allowed.");
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the dialog open for a retry after a server error", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 500,
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Try again.",
      }),
    );
    renderShell(ADMIN_BOARD);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete board" }));
    await user.click(
      within(deleteDialog()).getByRole("button", { name: "Delete board" }),
    );
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        "Something went wrong. Try again.",
      ),
    );
    expect(deleteDialog()).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("BoardShell mobile controls", () => {
  it("gives the header controls a 44 px tappable area", () => {
    renderShell(ADMIN_BOARD);
    expect(screen.getByRole("button", { name: "Rename board" })).toHaveClass(
      "min-h-11",
      "min-w-11",
    );
    expect(screen.getByRole("button", { name: "Delete board" })).toHaveClass(
      "min-h-11",
      "min-w-11",
    );
  });
});

describe("BoardShell member removal refreshes the board (Requirement 6.8, K12, Property 16)", () => {
  const assigned: ColumnWithCards[] = [
    {
      id: "c1",
      board_id: BOARD_ID,
      name: "To do",
      is_done: false,
      order: 1024,
      cards: [
        { id: "k1", column_id: "c1", title: "Write spec", description: null, assignee_id: BEN_ID, assignee_name: "Ben", order: 1024 },
        { id: "k2", column_id: "c1", title: "Review", description: null, assignee_id: null, assignee_name: null, order: 2048 },
      ],
    },
    { id: "c2", board_id: BOARD_ID, name: "Doing", is_done: false, order: 2048, cards: [] },
  ];
  const cleared = (): ColumnWithCards[] => [
    { ...assigned[0], cards: [{ ...assigned[0].cards[0], assignee_id: null, assignee_name: null }, assigned[0].cards[1]] },
    assigned[1],
  ];
  const refetched = (columns: ColumnWithCards[], version: number) => ({ ...ADMIN_BOARD, position_version: version, columns });

  async function removeBen() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Members \(/ }));
    await user.click(screen.getByRole("button", { name: "Remove Ben" }));
    await user.click(within(screen.getByRole("dialog", { name: "Remove member?" })).getByRole("button", { name: "Remove member" }));
  }

  it("refetches the board after a successful removal, so cleared assignments show Unassigned", async () => {
    vi.mocked(apiRequest).mockResolvedValue(null);
    mockGets(() => refetched(cleared(), 5));
    renderShell(ADMIN_BOARD, assigned);
    const todo = within(screen.getByRole("region", { name: "To do" }));
    expect(todo.getByText("Ben")).toBeInTheDocument();
    await removeBen();
    await waitFor(() => expect(otherGets()).toEqual([[`/api/boards/${BOARD_ID}`]]));
    await waitFor(() => expect(todo.getAllByText("Unassigned")).toHaveLength(2));
    expect(refresh).toHaveBeenCalled(); // the members list still refreshes through the server
  });

  it("does not refetch the board when the removal fails", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new ApiError({ statusCode: 500, code: "INTERNAL_ERROR", message: "x" }));
    renderShell(ADMIN_BOARD, assigned);
    await removeBen();
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(otherGets()).toHaveLength(0);
  });

  it("waits for a pending move, then refetches, and the older move answer does not win", async () => {
    let finishMove!: (value: unknown) => void;
    vi.mocked(apiRequest).mockImplementation((method: string, path: string) => {
      if (path.includes("/position")) return new Promise((resolve) => (finishMove = resolve));
      return Promise.resolve(null); // DELETE member
    });
    mockGets(() => refetched(cleared(), 9));
    renderShell(ADMIN_BOARD, assigned);
    const user = userEvent.setup();

    // Start a move through the Move dialog. It stays pending.
    await user.click(screen.getByRole("button", { name: "Move Review" }));
    const dialog = screen.getByRole("dialog", { name: "Move card" });
    await user.selectOptions(within(dialog).getByLabelText("Column"), "Doing");
    await user.click(within(dialog).getByRole("button", { name: "Move card" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Kanban columns" })).toHaveAttribute("aria-busy", "true"));

    await removeBen();
    await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([m]) => m === "DELETE")).toBe(true));
    expect(otherGets()).toHaveLength(0); // the refetch waits for the move

    const movedColumns = [
      { ...assigned[0], cards: [assigned[0].cards[0]] },
      { ...assigned[1], cards: [{ ...assigned[0].cards[1], column_id: "c2", order: 1024 }] },
    ];
    await act(async () => {
      finishMove({ card: movedColumns[1].cards[0], columns: movedColumns, position_version: 6 });
    });
    await waitFor(() => expect(otherGets()).toHaveLength(1));
    // The refreshed board is the final state: Ben's card is unassigned and Review is where the
    // server put it. The move answer, which still showed Ben, did not overwrite it.
    await waitFor(() => expect(within(screen.getByRole("region", { name: "To do" })).queryByText("Ben")).not.toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Kanban columns" })).toHaveAttribute("aria-busy", "false");
  });
});

// Analytics panel wiring (T14; Requirements 6.1, 6.4, 6.5, 6.8, 8.5; Properties 11 and 12).
describe("BoardShell analytics panel", () => {
  const columns: ColumnWithCards[] = [
    {
      id: "c1",
      board_id: BOARD_ID,
      name: "To do",
      is_done: false,
      order: 1024,
      cards: [
        { id: "k2", column_id: "c1", title: "Review", description: null, assignee_id: null, assignee_name: null, order: 1024 },
      ],
    },
    { id: "c2", board_id: BOARD_ID, name: "Doing", is_done: false, order: 2048, cards: [] },
  ];
  const moved = (version: number) => {
    const after = [
      { ...columns[0], cards: [] },
      { ...columns[1], cards: [{ ...columns[0].cards[0], column_id: "c2", order: 1024 }] },
    ];
    return { card: after[1].cards[0], columns: after, position_version: version };
  };
  const analyticsPath = `/api/boards/${BOARD_ID}/analytics`;

  // The panel is closed by default. Open it so its read runs.
  const openAnalytics = async () => {
    await userEvent.setup().click(screen.getByRole("button", { name: "Analytics" }));
  };

  async function moveReview() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Move Review" }));
    const dialog = screen.getByRole("dialog", { name: "Move card" });
    await user.selectOptions(within(dialog).getByLabelText("Column"), "Doing");
    await user.click(within(dialog).getByRole("button", { name: "Move card" }));
  }

  it.each([
    ["an admin", ADMIN_BOARD],
    ["a member", MEMBER_BOARD],
  ])("shows the panel to %s and reads E29 once for this board", async (_who, board) => {
    renderShell(board, columns);
    expect(screen.getByRole("button", { name: "Analytics" })).toBeInTheDocument();
    expect(analyticsGets()).toHaveLength(0); // closed: no read yet
    await openAnalytics();
    await waitFor(() => expect(analyticsGets()).toEqual([[analyticsPath, expect.any(AbortSignal)]]));
  });

  it("puts the Analytics button in the header, on the right, not in the title row", () => {
    renderShell(ADMIN_BOARD, columns);
    const name = screen.getByRole("heading", { level: 1, name: "Alpha" });
    const button = screen.getByRole("button", { name: "Analytics" });
    expect(name.closest("header")).toContainElement(button);
    expect(name.parentElement).not.toContainElement(button);
    expect(button.parentElement).toContainElement(screen.getByRole("button", { name: "Rename board" }));
  });

  it("reads E29 again after a successful move raises the version, and not after a failed move", async () => {
    // A failed move rolls back and the board refetches. The refetch returns the same version.
    mockGets(() => ({ ...ADMIN_BOARD, position_version: 0, columns }));
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError({ statusCode: 500, code: "INTERNAL_ERROR", message: "x" }));
    renderShell(ADMIN_BOARD, columns);
    await openAnalytics();
    await waitFor(() => expect(analyticsGets()).toHaveLength(1));
    await moveReview(); // fails and rolls back, so the version does not rise
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(analyticsGets()).toHaveLength(1);

    vi.mocked(apiRequest).mockResolvedValueOnce(moved(1));
    await moveReview();
    await waitFor(() => expect(analyticsGets()).toHaveLength(2));
  });

  it("stays usable when E29 fails at mount and on a later read: a card moves, the search works", async () => {
    mockGets(
      (path) => (path.includes("/cards/search") ? [{ id: "k2", title: "Review", column_id: "c1" }] : undefined),
      () => {
        throw new ApiError({ statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "down" });
      },
    );
    vi.mocked(apiRequest).mockResolvedValueOnce(moved(1));
    renderShell(ADMIN_BOARD, columns);
    await openAnalytics();
    const columnsRegion = screen.getByRole("region", { name: "Kanban columns" });

    // The panel shows its own error and Retry. The board shows none and its gate is idle.
    expect(await screen.findByRole("alert")).toHaveTextContent("Analytics could not be loaded.");
    expect(within(columnsRegion).queryByRole("alert")).not.toBeInTheDocument();
    expect(columnsRegion).toHaveAttribute("aria-busy", "false");

    // A card still moves, and the version rise starts a second read that also fails.
    await moveReview();
    await waitFor(() => expect(analyticsGets()).toHaveLength(2));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Doing" })).getByText("Review")).toBeInTheDocument());
    expect(columnsRegion).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("alert")).toHaveTextContent("Analytics could not be loaded.");

    // The search still sends its request and the board is not replaced by an error state.
    await userEvent.setup().type(screen.getByLabelText("Search cards"), "rev");
    await waitFor(() => expect(otherGets().some(([path]) => String(path).includes("/cards/search?q=rev"))).toBe(true));
    expect(screen.getByRole("heading", { level: 1, name: "Alpha" })).toBeInTheDocument();
    expect(notifyError).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("a 404 from E29 shows the access toast and goes to the dashboard", async () => {
    mockGets(() => undefined, () => {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "gone" });
    });
    renderShell(ADMIN_BOARD, columns);
    await openAnalytics();
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(BOARD_ACCESS_MESSAGE));
    expect(push).toHaveBeenCalledWith("/");
  });
});
