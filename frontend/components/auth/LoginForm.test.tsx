import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import { notifyError } from "@/lib/toast";
import { LoginForm } from "./LoginForm";

vi.mock("@/lib/apiClient", () => ({ apiPost: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const apiError = (statusCode: number | null, code: string, message: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ statusCode, code, message, ...extra });

beforeEach(() => {
  vi.mocked(apiPost).mockReset();
  vi.mocked(hardRedirect).mockReset();
  vi.mocked(notifyError).mockReset();
});

async function fill(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText("Email"), email);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  return user;
}

describe("LoginForm", () => {
  it("has exactly two inputs, email and password, and turns native validation off", () => {
    const { container } = render(<LoginForm redirectTo="/" />);
    const names = Array.from(container.querySelectorAll("input")).map((input) => input.name);
    expect(names).toEqual(["email", "password"]);
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute("type", "submit");
  });

  it("sends exactly email and password, with the email normalized and the password untouched", async () => {
    vi.mocked(apiPost).mockResolvedValue({ user: {} });
    render(<LoginForm redirectTo="/" />);
    const user = await fill("  Ada@Example.COM ", "  my password  ");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/api/auth/login", { email: "ada@example.com", password: "  my password  " });
    expect(Object.keys(vi.mocked(apiPost).mock.calls[0][1] as object)).toEqual(["email", "password"]);
  });

  it("shows the rule messages, focuses the first invalid field and sends nothing when the form is empty", async () => {
    render(<LoginForm redirectTo="/" />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getAllByText("Required.")).toHaveLength(1);
    expect(screen.getByText("Must be 1 to 128 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("focuses the password when only the password is missing", async () => {
    render(<LoginForm redirectTo="/" />);
    const user = await fill("ada@example.com", "");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("goes to the redirectTo prop with a full page load on success", async () => {
    vi.mocked(apiPost).mockResolvedValue({ user: {} });
    render(<LoginForm redirectTo="/boards/abc" />);
    const user = await fill("ada@example.com", "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(hardRedirect).toHaveBeenCalledExactlyOnceWith("/boards/abc"));
  });

  it("shows the generic message for invalid credentials, keeps the email and shows no toast", async () => {
    vi.mocked(apiPost).mockRejectedValue(apiError(401, "INVALID_CREDENTIALS", "Invalid email or password."));
    render(<LoginForm redirectTo="/" />);
    const user = await fill("ada@example.com", "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password.");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("wrong");
    expect(notifyError).not.toHaveBeenCalled();
    expect(hardRedirect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows server field errors inline and focuses the first one", async () => {
    vi.mocked(apiPost).mockRejectedValue(
      apiError(400, "VALIDATION_ERROR", "Check the submitted fields.", { fields: { password: "Must be 1 to 128 characters." } }),
    );
    render(<LoginForm redirectTo="/" />);
    const user = await fill("ada@example.com", "x");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Must be 1 to 128 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveFocus();
  });

  it.each([
    [429, "RATE_LIMITED", "Too many requests."],
    [413, "CONTENT_TOO_LARGE", "The request could not be sent."],
    [415, "UNSUPPORTED_MEDIA_TYPE", "The request could not be sent."],
    [503, "SERVICE_UNAVAILABLE", "Try again shortly."],
  ])("reports a %s with one toast and no inline message", async (status, code, message) => {
    vi.mocked(apiPost).mockRejectedValue(apiError(status, code, message));
    render(<LoginForm redirectTo="/" />);
    const user = await fill("ada@example.com", "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is busy and ignores a second submit while the request is pending", async () => {
    let finish: (value: unknown) => void = () => {};
    vi.mocked(apiPost).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { container } = render(<LoginForm redirectTo="/" />);
    const user = await fill("ada@example.com", "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const button = await screen.findByRole("button", { name: /Signing in/ });
    expect(button).toBeDisabled();
    expect(container.querySelector("form")).toHaveAttribute("aria-busy", "true");
    await user.type(screen.getByLabelText("Password"), "{Enter}");
    expect(apiPost).toHaveBeenCalledTimes(1);
    finish({ user: {} });
    await waitFor(() => expect(hardRedirect).toHaveBeenCalled());
  });
});
