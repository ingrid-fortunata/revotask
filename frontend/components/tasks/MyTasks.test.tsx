import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "@/lib/types";
import { MyTasks } from "./MyTasks";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeEach(() => refresh.mockClear());

const task = (id: string, boardId: string, boardName: string, over: Partial<TaskItem> = {}): TaskItem => ({
  id,
  column_id: "c",
  title: `Task ${id}`,
  description: null,
  assignee_id: "me",
  assignee_name: "Me",
  order: 1,
  board_id: boardId,
  board_name: boardName,
  column_name: "To do",
  is_done: false,
  ...over,
});

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";

describe("MyTasks", () => {
  it("shows the title and groups by board in the order given, with a link on the heading and on each row", () => {
    render(
      <MyTasks tasks={[task("1", B2, "Beta"), task("2", B2, "Beta"), task("3", B1, "Alpha")]} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "My tasks" })).toBeVisible();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => within(h).getByRole("link").getAttribute("href"))).toEqual([`/boards/${B2}`, `/boards/${B1}`]);
    const beta = screen.getByRole("region", { name: "Beta" });
    expect(within(beta).getByRole("link", { name: "Beta" })).toHaveAttribute("href", `/boards/${B2}`);
    const rows = within(beta).getAllByRole("link", { name: /Task/ });
    expect(rows.map((link) => link.getAttribute("aria-label"))).toEqual(["Task 1, Beta, To do", "Task 2, Beta, To do"]);
    for (const link of rows) expect(link).toHaveAttribute("href", `/boards/${B2}`);
  });

  it("never puts a card ID in a link", () => {
    render(<MyTasks tasks={[task("card-secret-id", B1, "Alpha")]} />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toContain("card-secret-id");
      expect(link.getAttribute("href")).not.toContain("?");
    }
  });

  it.each([
    [[task("1", B1, "Alpha")], "1 task on 1 board"],
    [[task("1", B1, "Alpha"), task("2", B1, "Alpha")], "2 tasks on 1 board"],
    [[task("1", B1, "Alpha"), task("2", B2, "Beta"), task("3", B2, "Beta")], "3 tasks on 2 boards"],
  ])("summarizes %#", (tasks, text) => {
    render(<MyTasks tasks={tasks} />);
    const summary = screen.getByText(
      (_content, element) => element?.tagName === "P" && element.textContent?.replace(/\s+/g, " ").trim() === text,
    );
    expect(summary.querySelectorAll(".tabular-nums")).toHaveLength(2);
  });

  it("shows the empty state and no summary or group", () => {
    render(<MyTasks tasks={[]} />);
    expect(screen.getByText("No cards are assigned to you.")).toBeVisible();
    expect(screen.getByText("Cards assigned to you on any board appear here.")).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText(/tasks? on/)).toBeNull();
  });

  it("shows a description excerpt clamped to two lines and wraps long text", () => {
    const long = "w".repeat(300);
    render(<MyTasks tasks={[task("1", B1, "Alpha", { title: long, description: "A longer note" })]} />);
    const title = screen.getByText(long);
    expect(title).toHaveClass("break-words", "min-w-0");
    expect(screen.getByText("A longer note")).toHaveClass("line-clamp-2", "break-words");
  });

  it("omits the excerpt when there is no description", () => {
    render(<MyTasks tasks={[task("1", B1, "Alpha")]} />);
    expect(document.querySelector(".line-clamp-2")).toBeNull();
  });

  it("gives every link a 44 px box and never nests a panel in a panel", () => {
    const { container } = render(<MyTasks tasks={[task("1", B1, "Alpha")]} />);
    for (const link of screen.getAllByRole("link")) expect(link).toHaveClass("min-h-11", "min-w-11");
    for (const surface of container.querySelectorAll(".surface")) {
      expect(surface.querySelector(".surface")).toBeNull();
    }
  });
});

const summaryText = () =>
  screen.getByText((_content, element) => element?.tagName === "P" && element.classList.contains("surface")).textContent;

describe("MyTasks status badge (Rev 2, Requirements 9.2 to 9.5)", () => {
  it("shows every row's column name, success with a check for a Done column and ghost with no icon otherwise", () => {
    render(
      <MyTasks
        tasks={[
          task("1", B1, "Alpha", { column_name: "Doing", is_done: false }),
          task("2", B1, "Alpha", { column_name: "Done", is_done: true }),
        ]}
      />,
    );
    const open = screen.getByRole("link", { name: "Task 1, Alpha, Doing" });
    const done = screen.getByRole("link", { name: "Task 2, Alpha, Done" });
    const openBadge = within(open).getByText("Doing").closest(".badge");
    const doneBadge = within(done).getByText("Done").closest(".badge");
    expect(openBadge).toHaveClass("badge-ghost");
    expect(openBadge?.querySelector("svg")).toBeNull();
    expect(doneBadge).toHaveClass("badge-success");
    expect(doneBadge?.querySelector("svg")).not.toBeNull();
    expect(doneBadge).not.toHaveClass("badge-ghost");
  });

  it("uses the board's own wording for a renamed Done column", () => {
    render(<MyTasks tasks={[task("1", B1, "Alpha", { column_name: "Selesai", is_done: true })]} />);
    const badge = screen.getByText("Selesai").closest(".badge");
    expect(badge).toHaveClass("badge-success");
    expect(badge?.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Task 1, Alpha, Selesai" })).toBeVisible();
  });

  it("wraps an 80-character column name inside a badge capped below the row width", () => {
    const longName = "c".repeat(80);
    render(<MyTasks tasks={[task("1", B1, "Alpha", { column_name: longName })]} />);
    const badge = screen.getByText(longName).closest(".badge");
    expect(badge).toHaveClass("h-auto", "max-w-[45%]", "whitespace-normal", "shrink-0");
    expect(screen.getByText(longName)).toHaveClass("break-words", "min-w-0");
  });

  it("keeps the row order and links to the board only", () => {
    render(
      <MyTasks
        tasks={[
          task("1", B1, "Alpha", { is_done: true, column_name: "Done" }),
          task("2", B1, "Alpha"),
          task("3", B1, "Alpha", { is_done: true, column_name: "Done" }),
        ]}
      />,
    );
    const rows = within(screen.getByRole("region", { name: "Alpha" })).getAllByRole("link", { name: /Task/ });
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Task 1, Alpha, Done",
      "Task 2, Alpha, To do",
      "Task 3, Alpha, Done",
    ]);
    for (const row of rows) expect(row).toHaveAttribute("href", `/boards/${B1}`);
  });
});

describe("MyTasks search (Rev 2, Requirement 10)", () => {
  const tasks = [
    task("1", B2, "Beta", { title: "Write Report" }),
    task("2", B2, "Beta", { title: "Fix 50% bug", description: "quarterly numbers" }),
    task("3", B1, "Alpha", { title: "Plan trip" }),
  ];
  afterEach(() => vi.unstubAllGlobals());

  it("shows no field and no search text when there is no task", () => {
    render(<MyTasks tasks={[]} />);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText(/of \d+ tasks?/)).toBeNull();
  });

  it("renders a labelled search field limited to 100 characters with a 16 px font", () => {
    render(<MyTasks tasks={tasks} />);
    const field = screen.getByRole("searchbox", { name: "Search my tasks" });
    expect(field).toHaveAttribute("type", "search");
    expect(field).toHaveAttribute("maxlength", "100");
    expect(field).toHaveClass("text-base", "min-h-11");
    expect(summaryText()).toBe("3 tasks on 2 boards");
  });

  it("filters at once, with no request, hides groups with no match and keeps the order", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<MyTasks tasks={tasks} />);
    await user.type(screen.getByRole("searchbox"), "report");
    expect(screen.getByRole("link", { name: /^Write Report/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: /^Plan trip/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Alpha" })).toBeNull();
    expect(summaryText()).toBe("1 of 3 tasks on 1 board");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("matches case-insensitively, trims, and treats % as literal text", async () => {
    const user = userEvent.setup();
    render(<MyTasks tasks={tasks} />);
    const field = screen.getByRole("searchbox");
    await user.type(field, "  PLAN  ");
    expect(screen.getByRole("link", { name: /^Plan trip/ })).toBeVisible();
    await user.clear(field);
    await user.type(field, "%");
    expect(screen.getAllByRole("link", { name: /Task|Fix|Write|Plan/ }).map((l) => l.getAttribute("aria-label"))).toEqual([
      "Fix 50% bug, Beta, To do",
    ]);
  });

  it("matches the title only", async () => {
    const user = userEvent.setup();
    render(<MyTasks tasks={tasks} />);
    await user.type(screen.getByRole("searchbox"), "quarterly");
    expect(screen.getByText(/No tasks match \u201c/)).toBeVisible();
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "Beta");
    expect(screen.getByText(/No tasks match \u201c/)).toBeVisible();
  });

  it("shows a no-match state with the query as plain text, differs from the empty state and keeps the field", async () => {
    const user = userEvent.setup();
    render(<MyTasks tasks={tasks} />);
    await user.type(screen.getByRole("searchbox"), "<b>x</b>");
    expect(screen.getByText(/No tasks match \u201c/).textContent).toBe("No tasks match \u201c<b>x</b>\u201d.");
    expect(document.querySelector("b")).toBeNull();
    expect(screen.queryByText("No cards are assigned to you.")).toBeNull();
    expect(screen.getByRole("searchbox")).toBeVisible();
    expect(summaryText()).toBe("0 of 3 tasks");
    expect(screen.queryByRole("link", { name: /Write/ })).toBeNull();
  });

  it("Clear search empties the field, focuses it and restores the full list", async () => {
    const user = userEvent.setup();
    render(<MyTasks tasks={tasks} />);
    await user.type(screen.getByRole("searchbox"), "zzz");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("searchbox")).toHaveFocus();
    expect(summaryText()).toBe("3 tasks on 2 boards");
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });

  it("treats a whitespace-only query as empty", async () => {
    const user = userEvent.setup();
    render(<MyTasks tasks={tasks} />);
    await user.type(screen.getByRole("searchbox"), "   ");
    expect(summaryText()).toBe("3 tasks on 2 boards");
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });

  it("announces the result in a polite live region", async () => {
    const user = userEvent.setup();
    const { container } = render(<MyTasks tasks={tasks} />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toHaveClass("sr-only");
    expect(live).toHaveTextContent("");
    await user.type(screen.getByRole("searchbox"), "p");
    expect(live).toHaveTextContent("2 tasks");
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(live).toHaveTextContent("No tasks match.");
  });
});

describe("MyTasks refresh (Rev 2, Requirement 9.6)", () => {
  const setVisibility = (state: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  afterEach(() => setVisibility("visible"));

  it("asks the server for fresh data once when it mounts, so a Back-restored render is replaced", () => {
    render(<MyTasks tasks={[task("1", B1, "Alpha")]} />);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes when the tab becomes visible and not when it is hidden", () => {
    render(<MyTasks tasks={[task("1", B1, "Alpha")]} />);
    refresh.mockClear();
    setVisibility("hidden");
    expect(refresh).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops listening when it unmounts and keeps the typed query across a refresh", async () => {
    const user = userEvent.setup();
    const { unmount, rerender } = render(<MyTasks tasks={[task("1", B1, "Alpha"), task("2", B1, "Alpha", { title: "Other" })]} />);
    await user.type(screen.getByRole("searchbox"), "task");
    rerender(<MyTasks tasks={[task("1", B1, "Alpha", { is_done: true, column_name: "Done" })]} />);
    expect(screen.getByRole("searchbox")).toHaveValue("task");
    expect(screen.getByRole("link", { name: "Task 1, Alpha, Done" })).toBeVisible();
    unmount();
    refresh.mockClear();
    setVisibility("visible");
    expect(refresh).not.toHaveBeenCalled();
  });
});
