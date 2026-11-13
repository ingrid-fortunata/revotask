import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth/AuthContext";
import { AppHeader } from "./AppHeader";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/apiClient", () => ({ apiPost: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

function renderHeader(name: string, email = "ada@example.com") {
  return render(
    <AuthProvider user={{ id: "1", name, email }}>
      <AppHeader />
    </AuthProvider>,
  );
}

describe("AppHeader", () => {
  it("shows the app name, the user's name and a Sign out button", () => {
    renderHeader("Ada Lovelace");
    expect(screen.getByText("RevoTask")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("wraps on a narrow screen and truncates a very long name inside a shrinkable element", () => {
    const longName = "N".repeat(200);
    renderHeader(longName);
    expect(screen.getByRole("banner")).toHaveClass("flex-wrap", "lg:fixed", "lg:w-64");
    const name = screen.getByText(longName);
    expect(name).toHaveClass("truncate", "min-w-0");
    expect(name).toHaveAttribute("title", longName);
    expect(name.parentElement).toHaveClass("min-w-0");
  });

  it("keeps Sign out at a 44 px tappable size", () => {
    renderHeader("Ada");
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveClass("min-h-11", "min-w-11");
  });

  it("marks Boards as the current page in the sidebar", () => {
    renderHeader("Ada");
    expect(screen.getByRole("link", { name: "Boards" })).toHaveAttribute("aria-current", "page");
  });

  it("does not show the email or any token", () => {
    renderHeader("Ada", "private@example.com");
    expect(document.body.textContent).not.toMatch(/private@example\.com|token/i);
  });
});
