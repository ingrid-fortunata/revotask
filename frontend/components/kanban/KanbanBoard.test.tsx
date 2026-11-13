import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useKanbanBoard } from "@/hooks/useKanbanBoard";
import { apiGet, apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import type { BoardRole, ColumnWithCards } from "@/lib/types";
import { KanbanBoard } from "./KanbanBoard";
import { BOARD_ID, board, card, column, detail, MEMBERS } from "./kanbanTestData";

// Feature: kanban, Properties 13, 14 and 15. The real board hook runs behind the island, with the
// browser client mocked, so these tests cover the wiring from a click or a drop to the request.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn(), apiGet: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));

function Harness({ role = "admin", columns = board() }: { role?: BoardRole; columns?: ColumnWithCards[] }) {
  const kanban = useKanbanBoard({ boardId: BOARD_ID, initial: { columns, version: 3 } });
  return <KanbanBoard role={role} members={MEMBERS} kanban={kanban} />;
}

const apiError = (statusCode: number, code: string) => new ApiError({ statusCode, code, message: `m ${code}` });
const moveReply = (columns: ColumnWithCards[], cardId: string, version = 4) => ({
  card: columns.flatMap((c) => c.cards).find((c) => c.id === cardId),
  columns,
  position_version: version,
});
const lane = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiGet).mockReset();
});

describe("showing the board", () => {
  it("shows each column in order with its name, count and cards inside the Kanban region", () => {
    render(<Harness />);
    const region = screen.getByRole("region", { name: "Kanban columns" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toMatch(/overflow-x-auto/);
    const headings = within(region).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Col todo", "Col doing", "Col done"]);
    expect(within(lane("Col todo")).getByText("2 cards")).toBeInTheDocument();
    expect(within(lane("Col doing")).getByText("1 card")).toBeInTheDocument();
    expect(within(lane("Col done")).getByText("0 cards")).toBeInTheDocument();
    expect(within(lane("Col todo")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows the assignee name or Unassigned on each card, and a Done badge with text", () => {
    render(<Harness />);
    expect(within(lane("Col todo")).getByText("Grace")).toBeInTheDocument();
    expect(within(lane("Col todo")).getByText("Unassigned")).toBeInTheDocument();
    expect(within(lane("Col done")).getByText("Done")).toBeInTheDocument();
    expect(within(lane("Col todo")).queryByText("Done")).not.toBeInTheDocument();
  });

  it("shows an empty-column message", () => {
    render(<Harness />);
    expect(within(lane("Col done")).getByText("No cards yet.")).toBeInTheDocument();
  });

  it("shows an Admin an Add your first column prompt with the form on an empty board", () => {
    render(<Harness columns={[]} />);
    expect(screen.getByText("Add your first column")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add column" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Kanban columns" })).not.toBeInTheDocument();
  });

  it("tells a Member an admin must add columns and shows no card controls", () => {
    render(<Harness role="member" columns={[]} />);
    expect(screen.getByText("This board has no columns yet. Ask an admin to add them.")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Property 13: role-based controls", () => {
  it.each([
    ["admin", true],
    ["member", false],
  ] as const)("%s sees the column controls: %s", (role, admin) => {
    render(<Harness role={role} />);
    for (const name of ["Edit column Col todo", "Delete column Col todo", "Move Col todo right", "Move Col doing left"]) {
      expect(screen.queryByRole("button", { name }) !== null).toBe(admin);
    }
    expect(screen.queryByRole("button", { name: "Add column" }) !== null).toBe(admin);
  });

  it.each(["admin", "member"] as const)("%s sees the card controls, the Move button and the add-card form", (role) => {
    render(<Harness role={role} />);
    const todo = within(lane("Col todo"));
    expect(todo.getByRole("button", { name: "Edit Card a" })).toBeInTheDocument();
    expect(todo.getByRole("button", { name: "Move Card a" })).toBeInTheDocument();
    expect(todo.getByRole("button", { name: "Add card to Col todo" })).toBeInTheDocument();
  });

  it("disables Move left on the first column and Move right on the last, with labels naming the column", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Move Col todo left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Col todo right" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Col doing left" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Col doing right" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Col done right" })).toBeDisabled();
  });
});

describe("Property 14: one Move_Function behind drag and the Move dialog", () => {
  const authoritative = () => [
    column("todo", 1024, [card("b", "todo", 1024, { assignee_id: "u-grace", assignee_name: "Grace" })]),
    column("doing", 2048, [card("a", "doing", 512), card("d", "doing", 1024)]),
    column("done", 3072, [], { is_done: true }),
  ];
  const body = { column_id: "doing", before_card_id: "d", expected_position_version: 3 };

  async function dragCardToBeforeD() {
    const dragged = screen.getByTestId("card-a");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(dragged, { dataTransfer });
    const target = screen.getByTestId("dropzone-doing-before-d");
    fireEvent.dragOver(target, { dataTransfer });
    await act(async () => {
      fireEvent.drop(target, { dataTransfer });
    });
  }

  it("a drop before a card sends the E20 request and applies the answer", async () => {
    vi.mocked(apiRequest).mockResolvedValue(moveReply(authoritative(), "a"));
    render(<Harness />);
    await dragCardToBeforeD();
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("PATCH", "/api/cards/a/position", body);
    await waitFor(() => expect(within(lane("Col doing")).getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getByRole("status")).toHaveTextContent("Moved Card a to Col doing, position 1 of 2.");
  });

  it("the Move dialog sends the identical request for the same destination", async () => {
    vi.mocked(apiRequest).mockResolvedValue(moveReply(authoritative(), "a"));
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Move Card a" }));
    const dialog = screen.getByRole("dialog", { name: "Move card" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Column"), "Col doing");
    await userEvent.selectOptions(within(dialog).getByLabelText("Position"), "Before Card d");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move card" }));
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("PATCH", "/api/cards/a/position", body);
  });

  it("a drop on the end strip sends a null anchor", async () => {
    vi.mocked(apiRequest).mockResolvedValue(moveReply(authoritative(), "a"));
    render(<Harness />);
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(screen.getByTestId("card-a"), { dataTransfer });
    await act(async () => {
      fireEvent.drop(screen.getByTestId("dropzone-doing-end"), { dataTransfer });
    });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("PATCH", "/api/cards/a/position", {
      column_id: "doing",
      before_card_id: null,
      expected_position_version: 3,
    });
  });

  it("a drop that leaves the card in place sends no request", async () => {
    render(<Harness />);
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(screen.getByTestId("card-b"), { dataTransfer });
    await act(async () => {
      fireEvent.drop(screen.getByTestId("dropzone-todo-end"), { dataTransfer });
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("Property 15: the gate disables the board", () => {
  it("marks the region busy, disables the controls and ignores a drag while a request is pending", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(apiRequest).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Move Card a" }));
    const dialog = screen.getByRole("dialog", { name: "Move card" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Column"), "Col doing");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move card" }));

    const region = screen.getByRole("region", { name: "Kanban columns" });
    await waitFor(() => expect(region).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByRole("button", { name: "Move Card b" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit column Col todo" })).toBeDisabled();
    expect(within(lane("Col doing")).getByRole("button", { name: "Add card to Col doing" })).toBeDisabled();
    expect(screen.getByTestId("card-d")).toHaveAttribute("draggable", "false");

    await act(async () => {
      resolve(moveReply([column("todo", 1024, [card("b", "todo", 1024)]), column("doing", 2048, [card("d", "doing", 1024), card("a", "doing", 2048)]), column("done", 3072, [], { is_done: true })], "a"));
    });
    await waitFor(() => expect(region).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByRole("button", { name: "Move Card b" })).toBeEnabled();
  });

  it("shows Reload board when the refetch fails, keeps controls disabled, and recovers on reload", async () => {
    vi.mocked(apiRequest).mockRejectedValue(apiError(409, "POSITION_CONFLICT"));
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(503, "SERVICE_UNAVAILABLE"));
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Move Card a" }));
    const dialog = screen.getByRole("dialog", { name: "Move card" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Column"), "Col doing");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move card" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The board could not be refreshed");
    expect(screen.getByRole("button", { name: "Move Card b" })).toBeDisabled();

    vi.mocked(apiGet).mockResolvedValueOnce(detail(board(), 9));
    await userEvent.click(screen.getByRole("button", { name: "Reload board" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reload board" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Move Card b" })).toBeEnabled();
  });
});

describe("column actions", () => {
  it("Move right sends E16 with the column after the next one as the anchor", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      columns: [
        { id: "doing", board_id: BOARD_ID, name: "Col doing", is_done: false, order: 512 },
        { id: "todo", board_id: BOARD_ID, name: "Col todo", is_done: false, order: 1024 },
        { id: "done", board_id: BOARD_ID, name: "Col done", is_done: true, order: 3072 },
      ],
      position_version: 4,
    });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Move Col todo right" }));
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("PATCH", `/api/boards/${BOARD_ID}/columns/reorder`, {
      column_id: "todo",
      before_column_id: "done",
      expected_position_version: 3,
    });
    await waitFor(() =>
      expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Col doing", "Col todo", "Col done"]),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Moved column Col todo, position 2 of 3.");
  });

  it("Move left sends the previous column as the anchor, and the last column moves right with a null anchor", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ columns: [], position_version: 4 });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Move Col done left" }));
    expect(apiRequest).toHaveBeenLastCalledWith("PATCH", `/api/boards/${BOARD_ID}/columns/reorder`, {
      column_id: "done",
      before_column_id: "doing",
      expected_position_version: 3,
    });
  });

  it("explains that a column with cards must be emptied first and sends nothing", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Delete column Col todo" }));
    expect(within(lane("Col todo")).getByRole("alert")).toHaveTextContent("Move or delete the cards in Col todo before deleting it.");
    expect(screen.queryByRole("dialog", { name: "Delete column?" })).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("asks for confirmation naming an empty column and deletes it after Confirm", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ position_version: 4 });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Delete column Col done" }));
    const confirm = screen.getByRole("dialog", { name: "Delete column?" });
    expect(within(confirm).getByText(/Col done/)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete column" }));
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("DELETE", "/api/columns/done");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Col done" })).not.toBeInTheDocument());
  });

  it("Cancel on the delete confirmation sends nothing", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Delete column Col done" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Delete column?" })).getByRole("button", { name: "Cancel" }));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("adds a column from the form and shows it without a reload", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      column: { id: "rev", board_id: BOARD_ID, name: "Review", is_done: false, order: 4096 },
      position_version: 4,
    });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    await userEvent.type(screen.getByLabelText("Column name"), "Review");
    await userEvent.click(within(screen.getByRole("form", { name: "Add column" })).getByRole("button", { name: "Add column" }));
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("POST", `/api/boards/${BOARD_ID}/columns`, { name: "Review", is_done: false });
    expect(await screen.findByRole("region", { name: "Review" })).toBeInTheDocument();
  });

  it("offers a Done checkbox that is disabled while a Done column exists", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(within(screen.getByRole("form", { name: "Add column" })).getByLabelText("Done column")).toBeDisabled();
  });
});

describe("card actions", () => {
  it("adds a card to a column and shows it", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ card: card("n", "doing", 2048, { title: "Fresh" }), position_version: 4 });
    render(<Harness />);
    await userEvent.click(within(lane("Col doing")).getByRole("button", { name: "Add card to Col doing" }));
    const form = screen.getByRole("form", { name: "Add card to Col doing" });
    await userEvent.type(within(form).getByLabelText("New card"), "Fresh");
    await userEvent.click(within(form).getByRole("button", { name: "Add card" }));
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("POST", "/api/columns/doing/cards", { title: "Fresh" });
    expect(await within(lane("Col doing")).findByRole("button", { name: "Edit Fresh" })).toBeInTheDocument();
  });

  it("edits and assigns a card from the dialog and shows the new assignee", async () => {
    vi.mocked(apiRequest).mockResolvedValue(card("a", "todo", 1024, { assignee_id: "u-ada", assignee_name: "Ada" }));
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Card a" }));
    const dialog = screen.getByRole("dialog", { name: "Edit card" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Assignee"), "Ada");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save card" }));
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("PATCH", "/api/cards/a", { assignee_id: "u-ada" });
    await waitFor(() => expect(within(lane("Col todo")).getByText("Ada")).toBeInTheDocument());
  });

  it("deletes a card after confirmation and removes it", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ position_version: 4 });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Card a" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Edit card" })).getByRole("button", { name: "Delete card" }));
    const confirm = screen.getByRole("dialog", { name: "Delete card?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete card" }));
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("DELETE", "/api/cards/a");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Edit Card a" })).not.toBeInTheDocument());
  });
});

describe("mobile classes", () => {
  it("stretches lanes to fill the width, at least 18 rem, and lets only the region scroll (FE-S2, FE-S4)", () => {
    render(<Harness />);
    expect(lane("Col todo").className).toMatch(/min-w-72/);
    expect(lane("Col todo").className).toMatch(/flex-1/);
    expect(screen.getByRole("region", { name: "Kanban columns" }).className).toMatch(/overflow-x-auto/);
  });
});
