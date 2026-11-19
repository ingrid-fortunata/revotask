import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import { notifyError, notifySuccess } from "@/lib/toast";
import { RegisterForm } from "./RegisterForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/apiClient", () => ({ apiPost: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const PASSWORD = "Horse-4Bat";
const PADDED_PASSWORD = " Hor-4Bt "; // 9 characters: padding counts toward the 10 maximum

beforeEach(() => {
  push.mockReset();
  for (const mock of [apiPost, hardRedirect, notifyError, notifySuccess]) vi.mocked(mock).mockReset();
});

async function fill(name: string, email: string, password: string) {
  const user = userEvent.setup();
  if (name) await user.type(screen.getByLabelText("Name"), name);
  if (email) await user.type(screen.getByLabelText("Email"), email);
  if (password) await user.type(screen.getByLabelText(/^Password/), password);
  return user;
}

describe("RegisterForm", () => {
  it("has exactly three inputs, name, email and password, with native validation off", () => {
    const { container } = render(<RegisterForm />);
    const names = Array.from(container.querySelectorAll("input")).map((input) => input.name);
    expect(names).toEqual(["name", "email", "password"]);
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("autocomplete", "new-password");
  });

  it("sends exactly name, email and password, normalized, and the password untouched", async () => {
    vi.mocked(apiPost).mockResolvedValue({});
    render(<RegisterForm />);
    const user = await fill("  Ada Lovelace  ", " Ada@Example.COM ", PADDED_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/api/auth/register", {
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: PADDED_PASSWORD,
    });
    expect(Object.keys(vi.mocked(apiPost).mock.calls[0][1] as object)).toEqual(["name", "email", "password"]);
  });

  it("shows the rule messages, focuses the first invalid field and sends nothing for an invalid form", async () => {
    render(<RegisterForm />);
    const user = await fill("", "not-an-email", "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText("Must be 1 to 80 characters.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Must be 8 to 10 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveValue("not-an-email");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("on success shows a toast, goes to /login, sets no session and does not call login", async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: "1" });
    render(<RegisterForm />);
    const user = await fill("Ada", "ada@example.com", PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/login"));
    expect(notifySuccess).toHaveBeenCalledExactlyOnceWith("Account created. Sign in to continue.");
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiPost).mock.calls[0][0]).toBe("/api/auth/register");
    expect(hardRedirect).not.toHaveBeenCalled();
  });

  it("shows a duplicate email on the email field and keeps every value", async () => {
    vi.mocked(apiPost).mockRejectedValue(
      new ApiError({ statusCode: 409, code: "EMAIL_ALREADY_EXISTS", message: "An account with this email already exists." }),
    );
    render(<RegisterForm />);
    const user = await fill("Ada", "ada@example.com", PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByLabelText("Name")).toHaveValue("Ada");
    expect(screen.getByLabelText(/^Password/)).toHaveValue(PASSWORD);
    expect(push).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("shows server field errors inline", async () => {
    vi.mocked(apiPost).mockRejectedValue(
      new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "Check.", fields: { role: "Unknown field.", name: "Required." } }),
    );
    render(<RegisterForm />);
    const user = await fill("Ada", "ada@example.com", PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Required.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  it.each([
    [429, "RATE_LIMITED"],
    [413, "CONTENT_TOO_LARGE"],
    [415, "UNSUPPORTED_MEDIA_TYPE"],
    [503, "SERVICE_UNAVAILABLE"],
  ])("reports a %s with one toast and stays on the form", async (status, code) => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError({ statusCode: status, code, message: "msg" }));
    render(<RegisterForm />);
    const user = await fill("Ada", "ada@example.com", PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("is busy while pending", async () => {
    vi.mocked(apiPost).mockReturnValue(new Promise(() => {}));
    const { container } = render(<RegisterForm />);
    const user = await fill("Ada", "ada@example.com", PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("button", { name: /Creating account/ })).toBeDisabled();
    expect(container.querySelector("form")).toHaveAttribute("aria-busy", "true");
  });
});

describe("RegisterForm password rules", () => {
  it("shows the password rules as a hint linked to the password input", () => {
    render(<RegisterForm />);
    const input = screen.getByLabelText(/^Password/);
    const hint = screen.getByText(/8 to 10 characters, with an uppercase letter/);
    expect(input).toHaveAttribute("aria-describedby", hint.id);
    expect(screen.getByLabelText("Password")).toHaveAttribute("name", "password");
  });

  it("shows the composition message when a long password lacks a special character", async () => {
    render(<RegisterForm />);
    const user = await fill("Ada", "ada@example.com", "Abcdefgh1");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByText("Must include an uppercase letter, a lowercase letter and a special character."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toHaveFocus();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("accepts an 8-character password with every required kind and sends it unchanged", async () => {
    vi.mocked(apiPost).mockResolvedValue({});
    render(<RegisterForm />);
    const user = await fill("Ada", "ada@example.com", "Aa1!aaaa");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiPost).mock.calls[0][1]).toMatchObject({ password: "Aa1!aaaa" });
  });
});
