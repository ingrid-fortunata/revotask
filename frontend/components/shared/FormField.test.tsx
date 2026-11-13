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
