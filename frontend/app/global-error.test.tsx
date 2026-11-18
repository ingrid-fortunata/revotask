import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";
import NotFound from "./not-found";

// GlobalError renders <html>, so it is mounted on the document element, not inside a <div>.
function renderGlobalError(retry = vi.fn()) {
  return render(<GlobalError error={new Error("secret internals SELECT *")} retry={retry} />, {
    container: document,
    baseElement: document.documentElement,
  });
}

describe("GlobalError", () => {
  it("shows a visible error state and never the error text", () => {
    renderGlobalError();
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/secret internals|SELECT/);
  });

  it("retries by re-fetching, not with reset", async () => {
    const retry = vi.fn();
    renderGlobalError(retry);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("keeps the retry button at a 44 px tappable size", () => {
    renderGlobalError();
    expect(screen.getByRole("button", { name: "Try again" })).toHaveClass("min-h-11", "min-w-11");
  });
});

describe("NotFound", () => {
  it("names the problem and links back to the app", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Go to RevoTask" });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveClass("min-h-11", "min-w-11");
  });
});
