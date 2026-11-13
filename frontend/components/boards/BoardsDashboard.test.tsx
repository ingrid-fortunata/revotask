import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import type { BoardSummary } from "@/lib/types";
import { BoardsDashboard } from "./BoardsDashboard";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

// Names use capital ASCII letters only. The browser sort (localeCompare) and the database
// collation agree on these, so the order assertions do not depend on the collation.
const ALPHA: BoardSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Alpha",
  role: "admin",
  position_version: 0,
};
const DELTA: BoardSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Delta",
  role: "member",
  position_version: 0,
};
const CHARLIE_ID = "33333333-3333-4333-8333-333333333333";
const CHARLIE: BoardSummary = {
  id: CHARLIE_ID,
  name: "Charlie",
  role: "admin",
  position_version: 0,
};

beforeEach(() => {
  push.mockReset();
  vi.mocked(apiRequest).mockReset();
});

// Returns the board name of each row, in rendered order. The name is the first span in each link.
function listedNames(): string[] {
  const list = screen.getByRole("list", { name: "Your boards" });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("span")?.textContent ?? "");
}

describe("BoardsDashboard list", () => {
  it("lists each board with its role badge and a link to its board page", () => {
    render(<BoardsDashboard initialBoards={[ALPHA, DELTA]} />);
    const alphaLink = screen.getByRole("link", { name: /Alpha/ });
    const deltaLink = screen.getByRole("link", { name: /Delta/ });
    expect(alphaLink).toHaveAttribute("href", `/boards/${ALPHA.id}`);
    expect(deltaLink).toHaveAttribute("href", `/boards/${DELTA.id}`);
    expect(within(alphaLink).getByText("Admin")).toHaveClass("badge-primary");
    expect(within(deltaLink).getByText("Member")).toHaveClass("badge-ghost");
    expect(screen.queryByText("You have no boards yet.")).toBeNull();
  });

  it("shows the empty state and the create form when there are no boards", () => {
    render(<BoardsDashboard initialBoards={[]} />);
    expect(screen.getByText("You have no boards yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Your boards" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Create a board" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Board name")).toBeInTheDocument();
  });
});

describe("BoardsDashboard create", () => {
  it("inserts the new board in name order and opens its page", async () => {
    vi.mocked(apiRequest).mockResolvedValue(CHARLIE);
    render(<BoardsDashboard initialBoards={[ALPHA, DELTA]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Board name"), "Charlie");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledExactlyOnceWith(`/boards/${CHARLIE_ID}`),
    );
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/boards", {
      name: "Charlie",
    });
    expect(listedNames()).toEqual([
      "Alpha",
      "Charlie",
      "Delta",
    ]);
  });

  it("places a new board that sorts first at the top of the list", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...CHARLIE, name: "Bravo" });
    render(<BoardsDashboard initialBoards={[ALPHA, DELTA]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Board name"), "Bravo");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(listedNames()).toEqual([
      "Alpha",
      "Bravo",
      "Delta",
    ]);
  });

  it("replaces the empty state with the first created board", async () => {
    vi.mocked(apiRequest).mockResolvedValue(CHARLIE);
    render(<BoardsDashboard initialBoards={[]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Board name"), "Charlie");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(screen.queryByText("You have no boards yet.")).toBeNull();
    expect(listedNames()).toEqual(["Charlie"]);
  });

  it("keeps the typed name and adds nothing to the list when the create fails", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Check the submitted fields.",
        fields: { name: "Must be 1 to 100 characters." },
      }),
    );
    render(<BoardsDashboard initialBoards={[ALPHA]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Board name"), "Charlie");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    expect(
      await screen.findByText("Must be 1 to 100 characters."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Board name")).toHaveValue("Charlie");
    expect(listedNames()).toEqual(["Alpha"]);
    expect(push).not.toHaveBeenCalled();
  });
});
