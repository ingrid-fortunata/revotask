import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/server/session";
import { getMyTasks } from "@/lib/server/tasks";
import type { TaskItem } from "@/lib/types";
import MyTasksPage from "./page";

// The real redirect() throws, so the page must not read tasks once the session check has thrown.
const { redirectSignal } = vi.hoisted(() => ({ redirectSignal: new Error("NEXT_REDIRECT /login") }));

vi.mock("@/lib/server/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/server/tasks", () => ({ getMyTasks: vi.fn() }));

const USER = { id: "1", name: "Ada", email: "a@b.co" };
const TASK: TaskItem = {
  id: "t1",
  column_id: "c",
  title: "Write report",
  description: "Quarterly",
  assignee_id: "1",
  assignee_name: "Ada",
  order: 1,
  board_id: "11111111-1111-4111-8111-111111111111",
  board_name: "Launch",
};

beforeEach(() => {
  vi.mocked(getCurrentUser).mockReset().mockResolvedValue(USER);
  vi.mocked(getMyTasks).mockReset().mockResolvedValue([TASK]);
});

describe("MyTasksPage", () => {
  it("verifies the session, reads E21 and renders the groups inside the dashboard main", async () => {
    const { container } = render(await MyTasksPage());
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(getMyTasks).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1, name: "My tasks" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Write report, Launch" })).toHaveAttribute(
      "href",
      "/boards/11111111-1111-4111-8111-111111111111",
    );
    const main = container.querySelector("main");
    expect(main?.className).toContain("mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8");
  });

  it("shows the empty state when there are no tasks", async () => {
    vi.mocked(getMyTasks).mockResolvedValue([]);
    render(await MyTasksPage());
    expect(screen.getByText("No cards are assigned to you.")).toBeVisible();
  });

  it("renders nothing when the session check redirects", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(redirectSignal);
    await expect(MyTasksPage()).rejects.toBe(redirectSignal);
  });

  it("throws a read failure to the error boundary and renders no partial list", async () => {
    const failure = new ApiError({ statusCode: 500, code: "INTERNAL_ERROR", message: "x" });
    vi.mocked(getMyTasks).mockRejectedValue(failure);
    await expect(MyTasksPage()).rejects.toBe(failure);
  });
});
