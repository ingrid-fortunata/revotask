import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage placeholder", () => {
  it("renders the RevoTask heading and placeholder text inside a daisyUI card", () => {
    const { container } = render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "RevoTask" })).toBeInTheDocument();
    expect(screen.getByText(/Application shell placeholder/)).toBeInTheDocument();
    expect(container.querySelector("section.card")).not.toBeNull();
  });
});
