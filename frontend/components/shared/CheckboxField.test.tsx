import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CheckboxField } from "./CheckboxField";

function setup(props: Partial<React.ComponentProps<typeof CheckboxField>> = {}) {
  const onChange = vi.fn();
  render(<CheckboxField id="done" name="is_done" label="Done column" checked={false} onChange={onChange} {...props} />);
  return onChange;
}

describe("CheckboxField", () => {
  it("links the label to the checkbox and reports changes", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByLabelText("Done column"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("clicking the label toggles the box", async () => {
    const onChange = setup({ checked: true });
    await userEvent.click(screen.getByText("Done column"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("states why a disabled box is disabled in text, linked with aria-describedby", () => {
    setup({ disabled: true, hint: "This board already has a Done column." });
    const box = screen.getByLabelText("Done column");
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("aria-describedby", "done-hint");
    expect(screen.getByText("This board already has a Done column.")).toHaveAttribute("id", "done-hint");
  });

  it("shows an error and marks the box invalid", () => {
    setup({ error: "Not allowed." });
    expect(screen.getByLabelText("Done column")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Not allowed.")).toBeInTheDocument();
  });

  it("makes the control itself 44 px, not only its row (FE-S5)", () => {
    setup();
    expect(screen.getByLabelText("Done column").className).toMatch(/\[--size:2\.75rem\]/);
  });
});
