import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BoardHeader, type BoardHeaderProps } from "./BoardHeader";

function renderHeader(overrides: Partial<BoardHeaderProps> = {}) {
  const props: BoardHeaderProps = {
    name: "Alpha",
    role: "admin",
    renameOpen: false,
    renameButtonRef: createRef<HTMLButtonElement>(),
    onToggleRename: vi.fn(),
    onRequestDelete: vi.fn(),
    ...overrides,
  };
  render(<BoardHeader {...props} />);
  return props;
}

describe("BoardHeader role-based controls (Requirements 3.10, Property 13)", () => {
  it("shows the board name as the heading and an Admin badge for an admin", () => {
    renderHeader({ role: "admin" });
    expect(screen.getByRole("heading", { level: 1, name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByText("Admin")).toHaveClass("badge-primary");
  });

  it("shows Rename and Delete controls to an admin", () => {
    renderHeader({ role: "admin" });
    expect(screen.getByRole("button", { name: "Rename board" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete board" })).toBeInTheDocument();
  });

  it("shows a Member badge and hides Rename and Delete from a member", () => {
    renderHeader({ role: "member" });
    expect(screen.getByRole("heading", { level: 1, name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByText("Member")).toHaveClass("badge-ghost");
    expect(screen.queryByRole("button", { name: "Rename board" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete board" })).not.toBeInTheDocument();
  });
});

describe("BoardHeader actions", () => {
  it("calls onToggleRename from the Rename button and reflects renameOpen in aria-expanded", async () => {
    const { onToggleRename } = renderHeader({ renameOpen: false });
    const button = screen.getByRole("button", { name: "Rename board" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(button);
    expect(onToggleRename).toHaveBeenCalledTimes(1);
  });

  it("sets aria-expanded to true while the rename form is open", () => {
    renderHeader({ renameOpen: true });
    expect(screen.getByRole("button", { name: "Rename board" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("calls onRequestDelete from the Delete button", async () => {
    const { onRequestDelete, onToggleRename } = renderHeader();
    await userEvent.setup().click(screen.getByRole("button", { name: "Delete board" }));
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(onToggleRename).not.toHaveBeenCalled();
  });

  it("attaches renameButtonRef to the Rename button so the shell can return focus to it", () => {
    const renameButtonRef = createRef<HTMLButtonElement>();
    renderHeader({ renameButtonRef });
    expect(renameButtonRef.current).toBe(screen.getByRole("button", { name: "Rename board" }));
  });
});

describe("BoardHeader mobile controls", () => {
  it("gives Rename and Delete a 44 px tappable area", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Rename board" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByRole("button", { name: "Delete board" })).toHaveClass("min-h-11", "min-w-11");
  });
});
