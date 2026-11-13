import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiClient";
import { BOARD_ACCESS_MESSAGE } from "@/lib/boardErrors";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import type { BoardSummary, Membership } from "@/lib/types";
import { BoardShell } from "./BoardShell";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn() }));
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

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(notifyError).mockReset();
});

function renderShell(board: BoardSummary, membersPanel?: ReactNode) {
  render(
    <BoardShell board={board} members={MEMBERS} membersPanel={membersPanel} />,
  );
}

function deleteDialog() {
  return screen.getByRole("dialog", { name: "Delete board?" });
}

describe("BoardShell layout (Requirement 2.7)", () => {
  it("shows the name header, role badge, members fallback and columns placeholder", () => {
    renderShell(ADMIN_BOARD);
    expect(
      screen.getByRole("heading", { level: 1, name: "Alpha" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("2 members")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Columns" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Columns will appear here.")).toBeInTheDocument();
  });

  it("renders the supplied members panel in place of the fallback", () => {
    renderShell(
      ADMIN_BOARD,
      <section aria-label="Panel stub">Members list</section>,
    );
    expect(
      screen.getByRole("region", { name: "Panel stub" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("2 members")).not.toBeInTheDocument();
  });
});

describe("BoardShell member view (Requirement 3.10)", () => {
  it("hides the rename and delete controls from a member", () => {
    renderShell(MEMBER_BOARD);
    expect(screen.getByText("Member")).toBeInTheDocument();
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
