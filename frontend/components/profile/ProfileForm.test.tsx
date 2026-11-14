import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import { notifyError, notifySuccess } from "@/lib/toast";
import { ProfileForm } from "./ProfileForm";

const refresh = vi.fn();
const setUser = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: USER, setUser }) }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const USER = { id: "11111111-1111-4111-8111-111111111111", name: "Ada Lovelace", email: "ada@example.com" };

beforeEach(() => {
  for (const mock of [refresh, setUser, apiRequest, hardRedirect, notifyError, notifySuccess]) {
    vi.mocked(mock).mockReset();
  }
});

const name = () => screen.getByLabelText("Name");
const email = () => screen.getByLabelText("Email");
const save = () => screen.getByRole("button", { name: /Save changes|Saving/ });

async function replace(field: HTMLElement, value: string) {
  const user = userEvent.setup();
  await user.clear(field);
  if (value) await user.type(field, value);
  return user;
}

describe("ProfileForm", () => {
  it("is seeded with the stored values, has two fields and no password input", () => {
    const { container } = render(<ProfileForm user={USER} />);
    expect(name()).toHaveValue("Ada Lovelace");
    expect(email()).toHaveValue("ada@example.com");
    expect(Array.from(container.querySelectorAll("input")).map((input) => input.name)).toEqual(["name", "email"]);
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/password/i);
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    expect(name()).toHaveAttribute("autocomplete", "name");
    expect(email()).toHaveAttribute("autocomplete", "email");
    expect(screen.getByText("You sign in with this email.")).toBeVisible();
  });

  it("disables Save while pristine and sends nothing", async () => {
    render(<ProfileForm user={USER} />);
    expect(save()).toBeDisabled();
    await userEvent.setup().click(save());
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("stays pristine for a change that normalizes to the saved value", async () => {
    render(<ProfileForm user={USER} />);
    await replace(email(), "  ADA@Example.com ");
    await replace(name(), "  Ada Lovelace  ");
    expect(save()).toBeDisabled();
  });

  it.each([
    ["name only", "Grace Hopper", "ada@example.com", { name: "Grace Hopper" }],
    ["email only", "Ada Lovelace", "grace@example.com", { email: "grace@example.com" }],
    [
      "both",
      "Grace Hopper",
      "grace@example.com",
      { name: "Grace Hopper", email: "grace@example.com" },
    ],
  ])("sends only the changed field(s): %s", async (_label, nextName, nextEmail, expected) => {
    vi.mocked(apiRequest).mockResolvedValue({ id: USER.id, name: nextName, email: nextEmail });
    render(<ProfileForm user={USER} />);
    await replace(name(), nextName);
    const user = await replace(email(), nextEmail);
    expect(save()).toBeEnabled();
    await user.click(save());
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/users/me", expected);
  });

  it("sends trimmed and lowercased values", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ id: USER.id, name: "Grace", email: "grace@example.com" });
    render(<ProfileForm user={USER} />);
    await replace(name(), "  Grace  ");
    const user = await replace(email(), " Grace@Example.COM ");
    await user.click(save());
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/users/me", { name: "Grace", email: "grace@example.com" });
  });

  it("on success reseeds, updates the context, refreshes the route and toasts once", async () => {
    const next = { id: USER.id, name: "Grace", email: "grace@example.com" };
    vi.mocked(apiRequest).mockResolvedValue({ ...next, access_token: "secret-sentinel" });
    render(<ProfileForm user={USER} />);
    await replace(name(), "  Grace ");
    const user = await replace(email(), "Grace@Example.com");
    await user.click(save());
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("Profile updated."));
    expect(notifySuccess).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledWith(next); // three fields only: the token is dropped by the parser
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(name()).toHaveValue("Grace");
    expect(email()).toHaveValue("grace@example.com");
    expect(save()).toBeDisabled(); // pristine again, and the user stays on the page
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("shows the rule messages, focuses the first invalid field and sends nothing", async () => {
    render(<ProfileForm user={USER} />);
    await replace(name(), "");
    const user = await replace(email(), "not-an-email");
    await user.click(save());
    expect(screen.getByText("Must be 1 to 80 characters.")).toBeVisible();
    expect(screen.getByText("Enter a valid email address.")).toBeVisible();
    expect(name()).toHaveFocus();
    expect(name()).toHaveAttribute("aria-invalid", "true");
    expect(email()).toHaveValue("not-an-email");
    expect(apiRequest).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
  });

  it("shows a 400 field message from Flask, keeps the text and shows no success", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "Check the submitted fields.", fields: { name: "Must be 1 to 80 characters." } }),
    );
    render(<ProfileForm user={USER} />);
    const user = await replace(name(), "Grace");
    await user.click(save());
    expect(await screen.findByText("Must be 1 to 80 characters.")).toBeVisible();
    expect(name()).toHaveValue("Grace");
    expect(name()).toHaveFocus();
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
  });

  it("shows a message for a key that has no field as a form-level alert", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "Check the submitted fields.", fields: { password: "Unknown field." } }),
    );
    render(<ProfileForm user={USER} />);
    const user = await replace(name(), "Grace");
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the submitted fields.");
  });

  it("shows a 409 inline under Email, keeps the typed values and leaves the context alone", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 409, code: "EMAIL_ALREADY_EXISTS", message: "An account with this email already exists." }),
    );
    render(<ProfileForm user={USER} />);
    await replace(name(), "Grace");
    const user = await replace(email(), "taken@example.com");
    await user.click(save());
    expect(await screen.findByText("An account with this email already exists.")).toBeVisible();
    expect(email()).toHaveAttribute("aria-invalid", "true");
    expect(email()).toHaveFocus();
    expect(email()).toHaveValue("taken@example.com");
    expect(name()).toHaveValue("Grace");
    expect(setUser).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(save()).toBeEnabled();
  });

  it("ignores a second submit while a request is pending and shows the pending state", async () => {
    let resolve: (value: unknown) => void = () => {};
    vi.mocked(apiRequest).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ProfileForm user={USER} />);
    const user = await replace(name(), "Grace");
    await user.click(save());
    await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled());
    await user.type(name(), "{Enter}");
    expect(apiRequest).toHaveBeenCalledTimes(1);
    resolve({ id: USER.id, name: "Grace", email: USER.email });
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it.each([
    ["a 5xx", new ApiError({ statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable. Try again shortly." })],
    ["a transport error", new ApiError({ statusCode: null, code: "SERVICE_UNAVAILABLE", message: "Could not reach the server. Check your connection and try again." })],
    ["a rate limit", new ApiError({ statusCode: 429, code: "RATE_LIMITED", message: "Too many attempts. Try again later." })],
  ])("%s toasts an error, keeps the text and enables Save again", async (_label, error) => {
    vi.mocked(apiRequest).mockRejectedValue(error);
    render(<ProfileForm user={USER} />);
    await replace(name(), "Grace");
    const user = await replace(email(), "grace@example.com");
    await user.click(save());
    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(name()).toHaveValue("Grace");
    expect(email()).toHaveValue("grace@example.com");
    expect(save()).toBeEnabled();
    expect(setUser).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("redirects to login on AUTH_REQUIRED", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 401, code: "AUTH_REQUIRED", message: "Your session has ended. Sign in again." }),
    );
    render(<ProfileForm user={USER} />);
    const user = await replace(name(), "Grace");
    await user.click(save());
    await waitFor(() => expect(hardRedirect).toHaveBeenCalledTimes(1));
    expect(vi.mocked(hardRedirect).mock.calls[0][0]).toMatch(/^\/login/);
  });

  it("rejects a malformed success response without updating the context", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ nope: true });
    render(<ProfileForm user={USER} />);
    const user = await replace(name(), "Grace");
    await user.click(save());
    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(setUser).not.toHaveBeenCalled();
    expect(name()).toHaveValue("Grace");
  });

  it("after a save, a further change is measured against the new saved values", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: USER.id, name: "Grace", email: USER.email });
    render(<ProfileForm user={USER} />);
    let user = await replace(name(), "Grace");
    await user.click(save());
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled());
    // Back to the old name is now a change from the saved "Grace".
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: USER.id, name: "Ada Lovelace", email: USER.email });
    user = await replace(name(), "Ada Lovelace");
    expect(save()).toBeEnabled();
    await user.click(save());
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(apiRequest).toHaveBeenLastCalledWith("PATCH", "/api/users/me", { name: "Ada Lovelace" });
  });

  it("renders the controls at the mobile size: 44 px boxes and 16 px text", () => {
    render(<ProfileForm user={USER} />);
    for (const control of [name(), email(), save()]) {
      expect(control.className).toMatch(/min-h-11/);
      expect(control.className).toMatch(/min-w-11/);
    }
    expect(name().className).toMatch(/text-base/);
    expect(email().className).toMatch(/text-base/);
  });
});
