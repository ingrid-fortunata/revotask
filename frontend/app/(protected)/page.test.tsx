import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBoards } from "@/lib/server/boards";
import { getCurrentUser } from "@/lib/server/session";
import type { BoardSummary } from "@/lib/types";
import HomePage from "./page";

// Mirrors the redirect() in lib/server/session.ts. The real redirect throws, so the page must not
// continue past the session check.
const { redirectSignal } = vi.hoisted(() => ({
  redirectSignal: new Error("NEXT_REDIRECT /login"),
}));

vi.mock("@/lib/server/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/server/boards", () => ({ getBoards: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const USER = { id: "1", name: "Ada", email: "a@b.co" };
const BOARDS: BoardSummary[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Launch",
    role: "admin",
    position_version: 0,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Backlog",
    role: "member",
    position_version: 0,
  },
];

beforeEach(() => {
  vi.mocked(getCurrentUser).mockReset().mockResolvedValue(USER);
  vi.mocked(getBoards).mockReset().mockResolvedValue(BOARDS);
});

describe("HomePage dashboard", () => {
  it("renders the signed-in user's boards with links and role badges", async () => {
    render(await HomePage());
    expect(
      screen.getByRole("heading", { level: 1, name: "Your boards" }),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Your boards" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Launch/ })).toHaveAttribute(
      "href",
      `/boards/${BOARDS[0].id}`,
    );
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("shows the empty state and the create form when the user has no boards", async () => {
    vi.mocked(getBoards).mockResolvedValue([]);
    render(await HomePage());
    expect(screen.getByText("You have no boards yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Create a board" }),
    ).toBeInTheDocument();
  });

  it("verifies the session in the page and then reads the boards through getBoards", async () => {
    await HomePage();
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(getBoards).toHaveBeenCalledTimes(1);
    expect(getBoards).toHaveBeenCalledWith();
  });

  it("does not read boards when the session check redirects", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(redirectSignal);
    await expect(HomePage()).rejects.toBe(redirectSignal);
    expect(getBoards).not.toHaveBeenCalled();
  });

  it("is mobile first: padded, width-capped and without full-height centering", async () => {
    render(await HomePage());
    const main = screen.getByRole("main");
    expect(main).toHaveClass("w-full", "max-w-6xl", "p-4", "sm:p-6", "lg:p-8");
    expect(main.className).not.toMatch(/min-h-screen|h-screen/);
  });
});
