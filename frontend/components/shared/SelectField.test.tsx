import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectField } from "./SelectField";

const OPTIONS = [
  { value: "", label: "Unassigned" },
  { value: "u1", label: "Ada" },
  { value: "u2", label: "Grace" },
];

function setup(props: Partial<React.ComponentProps<typeof SelectField>> = {}) {
  const onChange = vi.fn();
  render(
    <SelectField id="assignee" name="assignee_id" label="Assignee" value="" options={OPTIONS} onChange={onChange} {...props} />,
  );
  return onChange;
}

describe("SelectField", () => {
  it("links the label to the select and lists every option", () => {
    setup();
    const select = screen.getByLabelText("Assignee");
    expect(select.tagName).toBe("SELECT");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Unassigned", "Ada", "Grace"]);
    expect(select).not.toHaveAttribute("aria-invalid");
    expect(select).not.toHaveAttribute("aria-describedby");
  });

  it("calls onChange with the chosen value", async () => {
    const onChange = setup();
    await userEvent.selectOptions(screen.getByLabelText("Assignee"), "Grace");
    expect(onChange).toHaveBeenCalledWith("u2");
  });

  it("shows the error and the hint, marks the select invalid and links both", () => {
    setup({ error: "Choose a participant of this board.", hint: "Only participants." });
    const select = screen.getByLabelText("Assignee");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose a participant of this board.")).toHaveAttribute("id", "assignee-error");
    expect(screen.getByText("Only participants.")).toHaveAttribute("id", "assignee-hint");
    expect(select.getAttribute("aria-describedby")).toBe("assignee-hint assignee-error");
  });

  it("carries the 44 px and 16 px mobile classes (FE-S5)", () => {
    setup();
    const select = screen.getByLabelText("Assignee");
    expect(select.className).toMatch(/min-h-11/);
    expect(select.className).toMatch(/text-base/);
  });

  it("can be disabled", () => {
    setup({ disabled: true });
    expect(screen.getByLabelText("Assignee")).toBeDisabled();
  });
});
