import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "./AppHeader";

const path = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));
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
  beforeEach(() => {
    path.current = "/";
  });

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

describe("AppHeader navigation (S10, Q6; property 12)", () => {
  beforeEach(() => {
    path.current = "/";
  });

  it("shows Boards and My tasks with their targets", () => {
    renderHeader("Ada");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Boards" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "My tasks" })).toHaveAttribute("href", "/my-tasks");
  });

  it.each([
    ["/", "Boards"],
    ["/boards/abc", "Boards"],
    ["/my-tasks", "My tasks"],
  ])("marks exactly one link as the current page on %s", (pathname, current) => {
    path.current = pathname;
    renderHeader("Ada");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const marked = within(nav).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(marked.map((link) => link.textContent)).toEqual([current]);
  });

  it("marks no link on another page", () => {
    path.current = "/profile";
    renderHeader("Ada");
    expect(within(screen.getByRole("navigation", { name: "Main" })).queryByRole("link", { current: "page" })).toBeNull();
  });

  it("keeps both links at 44 px, visible at every width and in a second row below 1024 px", () => {
    renderHeader("Ada");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(nav).toHaveClass("order-last", "basis-full", "lg:order-none");
    for (const link of within(nav).getAllByRole("link")) {
      expect(link).toHaveClass("min-h-11", "min-w-11");
    }
  });

  it("makes the icons desktop only, so a phone shows text links", () => {
    const { container } = renderHeader("Ada");
    const nav = container.querySelector("nav") as HTMLElement;
    for (const svg of nav.querySelectorAll("svg")) {
      expect(svg.parentElement).toHaveClass("hidden", "lg:block");
    }
  });
});

describe("AppHeader account link (T12, P5)", () => {
  beforeEach(() => {
    path.current = "/";
  });

  it("links the Avatar and name to /profile with the name in its accessible name", () => {
    renderHeader("Ada Lovelace");
    const link = screen.getByRole("link", { name: "Profile, Ada Lovelace" });
    expect(link).toHaveAttribute("href", "/profile");
    expect(within(link).getByText("Ada Lovelace")).toBeVisible();
  });

  it("is not inside the main navigation, which still holds Boards and My tasks only", () => {
    renderHeader("Ada");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Boards", "My tasks"]);
    expect(within(nav).queryByRole("link", { name: /Profile/ })).toBeNull();
  });

  it.each([
    ["/profile", true],
    ["/profile/", true],
    ["/", false],
    ["/boards/abc", false],
    ["/my-tasks", false],
    ["/profiles", false],
  ])("sets aria-current on the account link only on a profile page: %s", (pathname, current) => {
    path.current = pathname;
    renderHeader("Ada");
    const link = screen.getByRole("link", { name: "Profile, Ada" });
    if (current) expect(link).toHaveAttribute("aria-current", "page");
    else expect(link).not.toHaveAttribute("aria-current");
  });

  it("marks no navigation link as current on /profile", () => {
    path.current = "/profile";
    renderHeader("Ada");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { current: "page" })).toBeNull();
  });

  it("keeps a 44 px target, a focus ring and a shrinkable, truncating name", () => {
    renderHeader("N".repeat(200));
    const link = screen.getByRole("link", { name: /^Profile, / });
    expect(link).toHaveClass("min-h-11", "min-w-11", "min-w-0", "focus-visible:outline-2", "focus-visible:outline-primary");
    expect(screen.getByText("N".repeat(200))).toHaveClass("truncate", "min-w-0");
  });

  it("keeps Sign out and both navigation links alongside it", () => {
    renderHeader("Ada");
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByRole("link", { name: "Boards" })).toBeVisible();
    expect(screen.getByRole("link", { name: "My tasks" })).toBeVisible();
  });

  it("shows the new name after setUser, in the label and the text", () => {
    let setUser: ReturnType<typeof useAuth>["setUser"] = () => {};
    function Grab() {
      setUser = useAuth().setUser;
      return null;
    }
    render(
      <AuthProvider user={{ id: "1", name: "Ada", email: "ada@example.com" }}>
        <Grab />
        <AppHeader />
      </AuthProvider>,
    );
    expect(screen.getByRole("link", { name: "Profile, Ada" })).toBeVisible();
    act(() => setUser({ id: "1", name: "Grace Hopper", email: "ada@example.com" }));
    expect(screen.getByRole("link", { name: "Profile, Grace Hopper" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Profile, Ada" })).toBeNull();
  });
});
