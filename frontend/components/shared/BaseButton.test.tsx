import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BaseButton } from "./BaseButton";

describe("BaseButton", () => {
  it("has the 44 px tappable-area classes and daisyUI variant classes", () => {
    render(<BaseButton>Save</BaseButton>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("btn", "btn-primary", "min-h-11", "min-w-11");
    expect(button).toHaveAttribute("type", "button");
  });

  it("maps the ghost variant", () => {
    render(<BaseButton variant="ghost">Cancel</BaseButton>);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("btn-ghost");
  });

  it("is disabled, busy and shows a spinner while loading, and does not fire clicks", async () => {
    const onClick = vi.fn();
    const { container } = render(
      <BaseButton loading onClick={onClick}>
        Saving
      </BaseButton>,
    );
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".loading-spinner")).not.toBeNull();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires clicks and is not busy when idle, and can be a submit button", async () => {
    const onClick = vi.fn();
    render(
      <BaseButton type="submit" onClick={onClick}>
        Go
      </BaseButton>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).toHaveAttribute("type", "submit");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
