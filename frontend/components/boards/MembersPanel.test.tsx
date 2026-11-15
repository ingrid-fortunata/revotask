import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiClient";
import { BOARD_ACCESS_MESSAGE } from "@/lib/boardErrors";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import type { BoardRole, Membership } from "@/lib/types";
import { MembersPanel } from "./MembersPanel";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const BEN_ID = "33333333-3333-4333-8333-333333333333";
const CY_ID = "44444444-4444-4444-8444-444444444444";
const NEW_ID = "55555555-5555-4555-8555-555555555555";

const ADA: Membership = { user_id: ADMIN_ID, name: "Ada", role: "admin" };
const BEN: Membership = { user_id: BEN_ID, name: "Ben", role: "member" };
const CY: Membership = { user_id: CY_ID, name: "Cy", role: "member" };
const MEMBERS = [ADA, BEN, CY];

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(notifyError).mockReset();
});

function openMembers() {
  fireEvent.click(screen.getByRole("button", { name: /^Members \(/ }));
}

// Renders the panel and opens the Members modal, where the list and the forms live.
function renderPanel(viewerRole: BoardRole, members: Membership[] = MEMBERS) {
  render(<MembersPanel boardId={BOARD_ID} viewerRole={viewerRole} members={members} />);
  openMembers();
}

function rowFor(name: string): HTMLElement {
  const item = screen.getAllByRole("listitem").find((li) => within(li).queryByText(name));
  if (!item) throw new Error(`No row for ${name}`);
  return item;
}

function removeDialog() {
  return screen.getByRole("dialog", { name: "Remove member?" });
}

async function openRemoveFor(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Remove ${name}` }));
  return user;
}

describe("MembersPanel avatars", () => {
  it("shows initials under the title and keeps the list closed until clicked", () => {
    render(<MembersPanel boardId={BOARD_ID} viewerRole="member" members={[{ ...ADA, name: "Ada Lovelace" }, BEN]} />);
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Members" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument();
    openMembers();
    expect(screen.getByRole("dialog", { name: "Members" })).toBeInTheDocument();
  });

  it("shows +N after five avatars", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ user_id: `id-${i}`, name: `User${i}`, role: "member" as const }));
    render(<MembersPanel boardId={BOARD_ID} viewerRole="member" members={many} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("opens the same modal from the admin Add member button", () => {
    render(<MembersPanel boardId={BOARD_ID} viewerRole="admin" members={MEMBERS} />);
    fireEvent.click(screen.getByRole("button", { name: "Add member" }));
    expect(screen.getByLabelText("Member email")).toBeInTheDocument();
  });
});

describe("MembersPanel list (Requirement 4.9)", () => {
  it("lists each participant's name and role in the order given", () => {
    renderPanel("member");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Ada");
    expect(items[0]).toHaveTextContent("Admin");
    expect(items[1]).toHaveTextContent("Ben");
    expect(items[1]).toHaveTextContent("Member");
    expect(items[2]).toHaveTextContent("Cy");
  });
});

describe("MembersPanel member view (Requirements 4.13, 5.8)", () => {
  it("hides the add-by-email form and every Remove control from a member", () => {
    renderPanel("member");
    expect(screen.queryByRole("form", { name: "Add member" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
  });
});

describe("MembersPanel admin view (Requirements 4.10, 5.8)", () => {
  it("shows the add-by-email form to an admin", () => {
    renderPanel("admin");
    expect(screen.getByRole("form", { name: "Add member" })).toBeInTheDocument();
    expect(screen.getByLabelText("Member email")).toBeInTheDocument();
  });

  it("shows Remove on member rows only and omits it for the board admin", () => {
    renderPanel("admin");
    expect(screen.getByRole("button", { name: "Remove Ben" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Cy" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Ada" })).not.toBeInTheDocument();
  });
});

describe("MembersPanel add through the form (Requirements 4.11, 4.15)", () => {
  it("lists the new member without a reload and refreshes the route once", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ user_id: NEW_ID, name: "Dee", role: "member" });
    renderPanel("admin");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Member email"), "dee@example.com");
    await user.click(within(screen.getByRole("form", { name: "Add member" })).getByRole("button", { name: "Add member" }));
    await waitFor(() => expect(rowFor("Dee")).toHaveTextContent("Member"));
    expect(screen.getByLabelText("Member email")).toHaveValue("");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("MembersPanel remove through the Confirm_Dialog (Requirements 4.15, 5.6, 5.7)", () => {
  it("opens the dialog naming the member, with Cancel and Confirm", async () => {
    renderPanel("admin");
    await openRemoveFor("Ben");
    const dialog = removeDialog();
    expect(within(dialog).getByText(/Remove Ben from this board/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Remove member" })).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("closes on Cancel without calling the API and keeps the member", async () => {
    renderPanel("admin");
    const user = await openRemoveFor("Ben");
    await user.click(within(removeDialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Remove member?" })).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
    expect(rowFor("Ben")).toBeInTheDocument();
  });

  it("sends E12 on Confirm, removes the row, closes the dialog and refreshes the route", async () => {
    vi.mocked(apiRequest).mockResolvedValue(null);
    renderPanel("admin");
    const user = await openRemoveFor("Ben");
    await user.click(within(removeDialog()).getByRole("button", { name: "Remove member" }));
    await waitFor(() =>
      expect(screen.queryByText("Ben")).not.toBeInTheDocument(),
    );
    expect(apiRequest).toHaveBeenCalledWith("DELETE", `/api/boards/${BOARD_ID}/members/${BEN_ID}`);
    expect(screen.queryByRole("dialog", { name: "Remove member?" })).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Cy")).toBeInTheDocument();
  });
});

describe("MembersPanel remove failures (Requirements 4.14, 5.5)", () => {
  it("shows the access error and navigates to / on a board-access 404", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "That item was not found." }),
    );
    renderPanel("admin");
    const user = await openRemoveFor("Ben");
    await user.click(within(removeDialog()).getByRole("button", { name: "Remove member" }));
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/"));
    expect(notifyError).toHaveBeenCalledWith(BOARD_ACCESS_MESSAGE);
    expect(rowFor("Ben")).toBeInTheDocument();
  });

  it("shows the conflict toast, keeps the row and refreshes on a 409", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 409,
        code: "STATE_CONFLICT",
        message: "That change conflicts with the current state.",
      }),
    );
    renderPanel("admin");
    const user = await openRemoveFor("Ben");
    await user.click(within(removeDialog()).getByRole("button", { name: "Remove member" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(notifyError).toHaveBeenCalledWith("That change conflicts with the current state.");
    expect(rowFor("Ben")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the dialog open for a retry after a server error", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 500, code: "INTERNAL_ERROR", message: "Something went wrong. Try again." }),
    );
    renderPanel("admin");
    const user = await openRemoveFor("Ben");
    await user.click(within(removeDialog()).getByRole("button", { name: "Remove member" }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("Something went wrong. Try again."),
    );
    expect(removeDialog()).toBeInTheDocument();
    expect(rowFor("Ben")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("MembersPanel mobile controls", () => {
  it("gives each Remove control a 44 px tappable area and the add email input 16 px text", () => {
    renderPanel("admin");
    expect(screen.getByRole("button", { name: "Remove Ben" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByLabelText("Member email")).toHaveClass("text-base", "min-h-11", "min-w-11");
  });

  // Finding F-T15-01 (LA-8): the avatar stack alone made the button 40 px wide.
  it("gives the Members button a 44 by 44 px tappable area", () => {
    renderPanel("admin");
    expect(screen.getByRole("button", { name: /^Members \(/ })).toHaveClass("min-h-11", "min-w-11");
  });
});


describe("onMemberRemoved (K12)", () => {
  async function confirmRemoveBen() {
    openMembers();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove Ben" }));
    await user.click(within(screen.getByRole("dialog", { name: "Remove member?" })).getByRole("button", { name: "Remove member" }));
  }

  it("is called once after a successful removal", async () => {
    vi.mocked(apiRequest).mockResolvedValue(null);
    const onMemberRemoved = vi.fn();
    render(<MembersPanel boardId={BOARD_ID} viewerRole="admin" members={MEMBERS} onMemberRemoved={onMemberRemoved} />);
    await confirmRemoveBen();
    await waitFor(() => expect(onMemberRemoved).toHaveBeenCalledTimes(1));
  });

  it("is not called when the removal fails", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new ApiError({ statusCode: 500, code: "INTERNAL_ERROR", message: "x" }));
    const onMemberRemoved = vi.fn();
    render(<MembersPanel boardId={BOARD_ID} viewerRole="admin" members={MEMBERS} onMemberRemoved={onMemberRemoved} />);
    await confirmRemoveBen();
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(onMemberRemoved).not.toHaveBeenCalled();
  });

  it("is optional", async () => {
    vi.mocked(apiRequest).mockResolvedValue(null);
    renderPanel("admin");
    await confirmRemoveBen();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove Ben" })).not.toBeInTheDocument());
  });
});
