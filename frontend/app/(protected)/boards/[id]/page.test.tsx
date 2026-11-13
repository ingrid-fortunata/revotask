import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPrivate, getCurrentUser } from "@/lib/server/session";
import type { BoardDetail, Membership } from "@/lib/types";
import BoardDetailPage from "./page";
import BoardNotFound from "./not-found";

// Signals thrown by the mocked redirect() and notFound(). The real functions throw too, so the page
// must stop rendering when either one fires.
const { redirectSignal, notFoundSignal } = vi.hoisted(() => ({
  redirectSignal: new Error("NEXT_REDIRECT /login"),
  notFoundSignal: new Error("NEXT_HTTP_ERROR_FALLBACK;404"),
}));

// Only the session module is mocked. lib/server/boards.ts runs for real, so the 404 and non-UUID
// paths exercise its notFound() calls.
vi.mock("@/lib/server/session", () => ({
  getCurrentUser: vi.fn(),
  fetchPrivate: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  notFound: vi.fn(() => {
    throw notFoundSignal;
  }),
  redirect: vi.fn(),
}));

const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const BOARD: BoardDetail = {
  id: BOARD_ID,
  name: "Launch plan",
  role: "admin",
  position_version: 0,
  columns: [],
};
const MEMBERS: Membership[] = [
  {
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Ada Admin",
    role: "admin",
  },
  {
    user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Grace Member",
    role: "member",
  },
];

const ok = (data: unknown) => ({
  status: 200,
  body: { data },
  retryAfter: null,
  requestId: "r",
});
const notFoundReply = {
  status: 404,
  body: { error: { code: "NOT_FOUND", message: "Board not found." } },
  retryAfter: null,
  requestId: "r",
};

function renderPage(id: string) {
  return BoardDetailPage({ params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.mocked(notFound).mockClear();
  vi.mocked(getCurrentUser)
    .mockReset()
    .mockResolvedValue({ id: "1", name: "Ada", email: "a@b.co" });
  vi.mocked(fetchPrivate)
    .mockReset()
    .mockImplementation(async (route) =>
      route === "board" ? ok(BOARD) : ok(MEMBERS),
    );
});

describe("BoardDetailPage", () => {
  it("renders the board name and members for a participant", async () => {
    render(await renderPage(BOARD_ID));
    expect(
      screen.getByRole("heading", { level: 1, name: "Launch plan" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Grace Member").length).toBeGreaterThan(0);
  });

  it("verifies the session and reads the board and its members through the helpers", async () => {
    render(await renderPage(BOARD_ID));
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(fetchPrivate).toHaveBeenCalledWith("board", {
      method: "GET",
      params: { boardId: BOARD_ID },
    });
    expect(fetchPrivate).toHaveBeenCalledWith("boardMembers", {
      method: "GET",
      params: { boardId: BOARD_ID },
    });
  });

  it("does not read the board when the session check redirects", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(redirectSignal);
    await expect(renderPage(BOARD_ID)).rejects.toBe(redirectSignal);
    expect(fetchPrivate).not.toHaveBeenCalled();
  });

  it("calls notFound() when Flask returns 404 for the board", async () => {
    vi.mocked(fetchPrivate).mockResolvedValue(notFoundReply);
    await expect(renderPage(BOARD_ID)).rejects.toBe(notFoundSignal);
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound() without contacting Flask when the id is not a UUID", async () => {
    await expect(renderPage("not-a-uuid")).rejects.toBe(notFoundSignal);
    expect(notFound).toHaveBeenCalled();
    expect(fetchPrivate).not.toHaveBeenCalled();
  });
});

describe("BoardNotFound", () => {
  it("links back to the dashboard", () => {
    render(<BoardNotFound />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Board not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to your boards" }),
    ).toHaveAttribute("href", "/");
  });
});
