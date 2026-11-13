import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/server/session";
import HomePage from "./page";

vi.mock("@/lib/server/session", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "1", name: "Ada", email: "a@b.co" }) }));

describe("HomePage placeholder", () => {
  it("renders the RevoTask heading and placeholder text inside a daisyUI card", async () => {
    const { container } = render(await HomePage());
    expect(screen.getByRole("heading", { level: 1, name: "RevoTask" })).toBeInTheDocument();
    expect(screen.getByText(/Application shell placeholder/)).toBeInTheDocument();
    expect(container.querySelector("section.card")).not.toBeNull();
  });

  it("verifies the session itself instead of relying on the layout", async () => {
    vi.mocked(getCurrentUser).mockClear();
    await HomePage();
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("is mobile first: padded, width-capped and without full-height centering", async () => {
    render(await HomePage());
    const main = screen.getByRole("main");
    expect(main).toHaveClass("w-full", "max-w-3xl", "p-4", "sm:p-6");
    expect(main.className).not.toMatch(/min-h-screen|h-screen/);
  });
});
