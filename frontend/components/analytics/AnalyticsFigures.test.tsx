import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BoardAnalytics } from "@/lib/types";
import { AnalyticsFigures } from "./AnalyticsFigures";

// Feature: analytics, Property 13 (every number is text, a bar is decorative) at component level.

const DATA: BoardAnalytics = {
  week_start: "2026-11-09T00:00:00Z",
  week_end: "2026-11-16T00:00:00Z",
  cards_per_column: [
    { column_id: "c1", name: "To do", count: 3 },
    { column_id: "c2", name: "In progress", count: 0 },
    { column_id: "c3", name: "Done", count: 6 },
  ],
  completed_cards: 4,
  member_activity: [
    { user_id: "u1", name: "Ana Lee", count: 9 },
    { user_id: "u2", name: "Ben Ortiz", count: 5 },
  ],
};

const EMPTY: BoardAnalytics = { ...DATA, cards_per_column: [], completed_cards: 0, member_activity: [] };

const rowsOf = (heading: string) =>
  within(screen.getByRole("region", { name: heading })).getAllByRole("listitem");

describe("AnalyticsFigures", () => {
  it("shows the week, the completed figure, the columns in order and the activity in order", () => {
    render(<AnalyticsFigures data={DATA} />);
    expect(screen.getByText("Week of 9 Nov, 07:00 to 16 Nov, 07:00 (local time)")).toBeInTheDocument();
    expect(screen.getByText("Cards completed this week")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(rowsOf("Cards per column").map((row) => row.textContent)).toEqual([
      "To do3",
      "In progress0",
      "Done6",
    ]);
    expect(rowsOf("Activity this week").map((row) => row.textContent)).toEqual(["Ana Lee9", "Ben Ortiz5"]);
  });

  it("shows 0 and both empty states for an empty board", () => {
    render(<AnalyticsFigures data={EMPTY} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("No columns yet.")).toBeInTheDocument();
    expect(screen.getByText("No activity this week.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("keeps the completed figure and the activity when there are columns but no activity", () => {
    render(<AnalyticsFigures data={{ ...DATA, member_activity: [] }} />);
    expect(rowsOf("Cards per column")).toHaveLength(3);
    expect(screen.getByText("No activity this week.")).toBeInTheDocument();
    expect(screen.queryByText("No columns yet.")).not.toBeInTheDocument();
  });

  it("renders markup in a name as text, never as HTML", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const { container } = render(
      <AnalyticsFigures
        data={{
          ...DATA,
          cards_per_column: [{ column_id: "c", name: hostile, count: 1 }],
          member_activity: [{ user_id: "u", name: hostile, count: 1 }],
        }}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(hostile)).toHaveLength(2);
  });

  it("wraps long names, keeps numbers on one line and uses tabular numbers", () => {
    render(<AnalyticsFigures data={DATA} />);
    const row = rowsOf("Activity this week")[0];
    expect(within(row).getByText("Ana Lee").className).toMatch(/min-w-0/);
    expect(within(row).getByText("Ana Lee").className).toMatch(/break-words/);
    const count = within(row).getByText("9");
    expect(count.className).toMatch(/tabular-nums/);
    expect(count.className).toMatch(/shrink-0/);
    expect(screen.getByText("4").className).toMatch(/tabular-nums/);
  });

  it("draws bars as decorative elements while every number stays as text", () => {
    const { container } = render(<AnalyticsFigures data={DATA} />);
    const bars = container.querySelectorAll('[aria-hidden="true"]');
    expect(bars).toHaveLength(3);
    const widths = [...bars].map((bar) => (bar.firstElementChild as HTMLElement).style.width);
    expect(widths).toEqual(["50%", "0%", "100%"]);
    for (const bar of bars) expect(bar.textContent).toBe("");
    // The counts are present as text, so no figure depends on the bar.
    expect(rowsOf("Cards per column").map((row) => row.textContent)).toEqual(["To do3", "In progress0", "Done6"]);
  });
});
