import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

describe("ErrorPage", () => {
  it("shows a visible error state and never the error text", () => {
    render(<ErrorPage error={new Error("secret internals SELECT *")} retry={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/secret internals|SELECT/);
  });

  it("retries by re-fetching the segment, which is what recovers from a failed server load", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    // `reset` is passed on purpose: Next 16.4 only clears the error with it and does not re-fetch.
    const props = { error: new Error("x"), retry, reset };
    render(<ErrorPage {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("keeps the retry button at a 44 px tappable size", () => {
    render(<ErrorPage error={new Error("x")} retry={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Try again" })).toHaveClass("min-h-11", "min-w-11");
  });
});
