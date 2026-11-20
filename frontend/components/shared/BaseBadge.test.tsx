import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BaseBadge } from "./BaseBadge";

describe("BaseBadge", () => {
  it("defaults to the ghost variant", () => {
    render(<BaseBadge>Todo</BaseBadge>);
    expect(screen.getByText("Todo")).toHaveClass("badge", "badge-ghost", "shrink-0");
  });

  it.each([
    ["primary", "badge-primary"],
    ["success", "badge-success"],
  ] as const)("renders the %s variant", (variant, cls) => {
    render(<BaseBadge variant={variant}>Label</BaseBadge>);
    const badge = screen.getByText("Label");
    expect(badge).toHaveClass(cls);
    expect(badge).not.toHaveClass("badge-ghost");
  });

  it("appends a caller class and keeps shrink-0", () => {
    render(<BaseBadge className="h-auto max-w-[45%]">Wrap</BaseBadge>);
    expect(screen.getByText("Wrap")).toHaveClass("h-auto", "max-w-[45%]", "shrink-0");
  });
});
