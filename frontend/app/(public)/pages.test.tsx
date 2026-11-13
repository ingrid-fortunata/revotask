import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublicLayout from "./layout";
import LoginPage from "./login/page";
import RegisterPage from "./register/page";

vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: ({ redirectTo }: { redirectTo: string }) => <div data-testid="login-form" data-redirect-to={redirectTo} />,
}));
vi.mock("@/components/auth/RegisterForm", () => ({ RegisterForm: () => <div data-testid="register-form" /> }));

async function renderLogin(next?: string | string[]) {
  render(await LoginPage({ searchParams: Promise.resolve(next === undefined ? {} : { next }) }));
  return screen.getByTestId("login-form").getAttribute("data-redirect-to");
}

describe("LoginPage", () => {
  it("passes / when there is no next value", async () => {
    expect(await renderLogin()).toBe("/");
  });

  it("passes a safe same-origin path through", async () => {
    expect(await renderLogin("/boards/abc?tab=1")).toBe("/boards/abc?tab=1");
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example", "/login", "/register", "javascript:alert(1)", "/a\nb"])(
    "passes / for the unsafe next value %j",
    async (next) => {
      expect(await renderLogin(next)).toBe("/");
    },
  );

  it("passes / when next is given more than once", async () => {
    expect(await renderLogin(["/boards/a", "/boards/b"])).toBe("/");
  });

  it("has a heading and a link to register", async () => {
    await renderLogin();
    expect(screen.getByRole("heading", { level: 1, name: /Sign in/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
  });
});

describe("RegisterPage", () => {
  it("renders the form with a heading and a link to sign in", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("heading", { level: 1, name: /Create your account/ })).toBeInTheDocument();
    expect(screen.getByTestId("register-form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});

describe("PublicLayout", () => {
  it("is a mobile-first column that stays at the top on a phone and centers from 640 px", () => {
    render(
      <PublicLayout>
        <p>child</p>
      </PublicLayout>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveClass("min-h-dvh", "w-full", "max-w-md", "items-start", "p-4", "sm:items-center", "sm:p-6");
    expect(main).toContainElement(screen.getByText("child"));
  });
});
