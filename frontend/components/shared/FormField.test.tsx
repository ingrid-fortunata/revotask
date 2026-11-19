import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { FormField } from "./FormField";

function Harness({ error }: { error?: string }) {
  const [value, setValue] = useState("");
  return <FormField id="email" name="email" label="Email" type="email" value={value} error={error} onChange={setValue} />;
}

describe("FormField", () => {
  it("labels the input and passes its name and type", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("name", "email");
    expect(input).toHaveAttribute("type", "email");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("updates through onChange", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("links an error to the input with aria-invalid and aria-describedby", () => {
    render(<Harness error="Enter a valid email address." />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const message = screen.getByText("Enter a valid email address.");
    expect(input).toHaveAttribute("aria-describedby", message.id);
    expect(message).toHaveClass("break-words");
  });

  it("sets 44 px and 16 px classes and no minLength or maxLength", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveClass("min-h-11", "min-w-11", "w-full", "text-base");
    expect(input).not.toHaveAttribute("minlength");
    expect(input).not.toHaveAttribute("maxlength");
  });
});

describe("FormField hint", () => {
  it("links both the hint and the error to the input", () => {
    render(
      <FormField id="pw" name="password" label="Password" value="" hint="Use 8 characters." error="Too short." onChange={() => {}} />,
    );
    const input = screen.getByLabelText("Password");
    const hint = screen.getByText("Use 8 characters.");
    const error = screen.getByText("Too short.");
    expect(input.getAttribute("aria-describedby")).toBe(`${hint.id} ${error.id}`);
  });

  it("links only the hint when there is no error", () => {
    render(<FormField id="pw" name="password" label="Password" value="" hint="Use 8 characters." onChange={() => {}} />);
    const hint = screen.getByText("Use 8 characters.");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", hint.id);
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-invalid");
  });
});

function MultilineHarness({ error, hint }: { error?: string; hint?: string }) {
  const [value, setValue] = useState("");
  return (
    <FormField
      id="description"
      name="description"
      label="Description"
      multiline
      rows={3}
      value={value}
      error={error}
      hint={hint}
      onChange={setValue}
    />
  );
}

describe("FormField multiline", () => {
  it("renders a labelled textarea with the same wiring as the input", async () => {
    render(<MultilineHarness hint="Optional." error="Must be at most 2000 characters." />);
    const area = screen.getByLabelText("Description");
    expect(area.tagName).toBe("TEXTAREA");
    expect(area).toHaveAttribute("name", "description");
    expect(area).toHaveAttribute("rows", "3");
    expect(area).toHaveAttribute("aria-invalid", "true");
    expect(area.getAttribute("aria-describedby")).toBe("description-hint description-error");
    await userEvent.type(area, "Steps to reproduce");
    expect(area).toHaveValue("Steps to reproduce");
  });

  it("keeps the 44 px and 16 px mobile classes", () => {
    render(<MultilineHarness />);
    const area = screen.getByLabelText("Description");
    expect(area.className).toMatch(/min-h-11/);
    expect(area.className).toMatch(/text-base/);
  });

  it("leaves the single-line field unchanged: still an input", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Email").tagName).toBe("INPUT");
  });
});

describe("FormField search type and maxLength", () => {
  it("renders a search input with the given maxLength", () => {
    render(<FormField id="s" name="s" label="Search" type="search" maxLength={100} value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Search");
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveAttribute("maxlength", "100");
  });

  it("sets no maxLength by default", () => {
    render(<FormField id="s" name="s" label="Search" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Search")).not.toHaveAttribute("maxlength");
  });

  it("renders a date field with its label, hint and error and the same 44 px and 16 px classes", () => {
    render(
      <FormField
        id="sprint-start"
        name="sprint_start"
        label="Sprint start"
        type="date"
        value="2026-11-16"
        hint="Optional. Set both or neither."
        error="Enter both sprint dates."
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText("Sprint start");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveValue("2026-11-16");
    expect(input).toHaveClass("min-h-11", "text-base", "w-full");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(describedBy).toContain(screen.getByText("Optional. Set both or neither.").id);
    expect(describedBy).toContain(screen.getByText("Enter both sprint dates.").id);
  });

  it("sets readOnly only when asked, and keeps the input focusable", () => {
    const { rerender } = render(<FormField id="a" name="a" label="A" value="x" onChange={() => {}} />);
    expect(screen.getByLabelText("A")).not.toHaveAttribute("readonly");
    rerender(<FormField id="a" name="a" label="A" value="x" readOnly onChange={() => {}} />);
    const input = screen.getByLabelText("A");
    expect(input).toHaveAttribute("readonly");
    expect(input).not.toBeDisabled();
    input.focus();
    expect(input).toHaveFocus();
  });

  it("does not change the typed value of a read-only input", async () => {
    render(<FormField id="a" name="a" label="A" value="fixed" readOnly onChange={() => {}} />);
    await userEvent.type(screen.getByLabelText("A"), "more");
    expect(screen.getByLabelText("A")).toHaveValue("fixed");
  });
});
