import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TaskItem } from "@/lib/types";
import { MyTasks } from "./MyTasks";

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
    expect(rows.map((link) => link.getAttribute("aria-label"))).toEqual(["Task 1, Beta", "Task 2, Beta"]);
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
