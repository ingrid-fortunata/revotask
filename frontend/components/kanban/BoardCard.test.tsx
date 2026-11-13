import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BoardCard } from "./BoardCard";
import { ColumnHeader } from "./ColumnHeader";
import { card } from "./kanbanTestData";

describe("BoardCard", () => {
  function setup(over: Parameters<typeof card>[3] = {}, disabled = false) {
    const onOpen = vi.fn();
    const onMove = vi.fn();
    render(<BoardCard card={card("k1", "c1", 1024, { title: "Fix login", ...over })} disabled={disabled} onOpen={onOpen} onMove={onMove} />);
    return { onOpen, onMove };
  }

  it("shows the title and the assignee name", () => {
    setup({ assignee_name: "Grace" });
    expect(screen.getByRole("button", { name: "Open Fix login" })).toHaveTextContent("Fix login");
    expect(screen.getByText("Grace")).toBeInTheDocument();
  });

  it("shows Unassigned when there is no assignee", () => {
    setup();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("calls onOpen from the title and onMove from the always-visible Move button", async () => {
    const { onOpen, onMove } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Open Fix login" }));
    await userEvent.click(screen.getByRole("button", { name: "Move Fix login" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while the board is busy", () => {
    setup({}, true);
    expect(screen.getByRole("button", { name: "Open Fix login" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Fix login" })).toBeDisabled();
  });

  it("gives both buttons the 44 px size class (FE-S5)", () => {
    setup();
    for (const name of ["Open Fix login", "Move Fix login"]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/min-h-11/);
    }
  });

  it("wraps a long title instead of overflowing (FE-S4)", () => {
    setup({ title: "x".repeat(160) });
    expect(screen.getByRole("button", { name: /^Open x+/ }).className).toMatch(/break-words/);
  });
});

describe("ColumnHeader", () => {
  it("shows the name, the card count and a Done badge with text", () => {
    render(<ColumnHeader headingId="h1" name="Shipped" count={2} isDone />);
    expect(screen.getByRole("heading", { name: "Shipped" })).toHaveAttribute("id", "h1");
    expect(screen.getByText("2 cards")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("uses the singular for one card, shows no badge for a plain column and renders controls", () => {
    render(<ColumnHeader headingId="h2" name="Todo" count={1} isDone={false} controls={<button type="button">Edit</button>} />);
    expect(screen.getByText("1 card")).toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
