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
// Fixed non-secret test values that meet the rules.
const OLD = "Old#pass1";
const NEW = "New#pass2";

beforeEach(() => {
  for (const mock of [refresh, setUser, apiRequest, hardRedirect, notifyError, notifySuccess]) {
    vi.mocked(mock).mockReset();
  }
});

const name = () => screen.getByLabelText("Name");
const email = () => screen.getByLabelText("Email");
const toggle = () => screen.getByRole("button", { name: /Change password|Cancel password change/ });
const current = () => screen.getByLabelText("Current password");
const next = () => screen.getByLabelText("New password");
const save = () => screen.getByRole("button", { name: /Save changes|Saving/ });

async function replace(field: HTMLElement, value: string) {
  const user = userEvent.setup();
  await user.clear(field);
  if (value) await user.type(field, value);
  return user;
}

async function openPassword() {
  const user = userEvent.setup();
  await user.click(toggle());
  return user;
}

function apiFailure(statusCode: number, code: string, message: string, fields?: Record<string, string>) {
  return new ApiError({ statusCode, code, message, fields });
}

describe("ProfileForm", () => {
  it("is seeded with the stored name, shows the email read-only and has no password input yet", () => {
    const { container } = render(<ProfileForm user={USER} />);
    expect(name()).toHaveValue("Ada Lovelace");
    expect(name()).toHaveAttribute("autocomplete", "name");
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    expect(email()).toHaveValue("ada@example.com");
    expect(email()).toHaveAttribute("readonly");
    expect(email()).not.toBeDisabled();
    expect(screen.getByText("You sign in with this email. It cannot be changed.")).toBeVisible();
    // The password section starts closed: no password input exists in the DOM.
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(Array.from(container.querySelectorAll("input")).map((input) => input.name)).toEqual(["name", "email"]);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the email focusable and not editable", async () => {
    render(<ProfileForm user={USER} />);
    const user = userEvent.setup();
    await user.click(email());
    expect(email()).toHaveFocus();
    await user.type(email(), "changed");
    expect(email()).toHaveValue("ada@example.com");
    expect(save()).toBeDisabled();
  });

  it("disables Save while pristine and sends nothing", async () => {
    render(<ProfileForm user={USER} />);
    expect(save()).toBeDisabled();
    await userEvent.setup().click(save());
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("stays pristine for a name that normalizes to the saved value", async () => {
    render(<ProfileForm user={USER} />);
    await replace(name(), "  Ada Lovelace  ");
    expect(save()).toBeDisabled();
  });

  it("stays pristine when the password section is open but both fields are empty", async () => {
    render(<ProfileForm user={USER} />);
    await openPassword();
    expect(save()).toBeDisabled();
  });

  describe("the password section", () => {
    it("opens with aria-expanded and shows two password fields with the right autocomplete and hint", async () => {
      const { container } = render(<ProfileForm user={USER} />);
      await openPassword();
      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(toggle()).toHaveAccessibleName("Cancel password change");
      expect(toggle().getAttribute("aria-controls")).toBe(container.querySelector("#profile-password-section")?.id);
      expect(current()).toHaveAttribute("type", "password");
      expect(current()).toHaveAttribute("autocomplete", "current-password");
      expect(next()).toHaveAttribute("type", "password");
      expect(next()).toHaveAttribute("autocomplete", "new-password");
      expect(screen.getByText(/8 to 10 characters, with an uppercase letter/)).toBeVisible();
      expect(screen.queryByLabelText(/confirm/i)).toBeNull();
    });

    it("closes with Cancel, empties both fields and clears their errors", async () => {
      const { container } = render(<ProfileForm user={USER} />);
      const user = await openPassword();
      await user.type(current(), OLD);
      await user.click(save()); // half pair: Required. under New password
      expect(screen.getByText("Required.")).toBeVisible();
      await user.click(toggle());
      expect(container.querySelector('input[type="password"]')).toBeNull();
      expect(screen.queryByText("Required.")).toBeNull();
      expect(save()).toBeDisabled();
      await user.click(toggle());
      expect(current()).toHaveValue("");
      expect(next()).toHaveValue("");
    });

    it("closing it sends no password key even after the user typed one", async () => {
      vi.mocked(apiRequest).mockResolvedValue({ id: USER.id, name: "Grace", email: USER.email });
      render(<ProfileForm user={USER} />);
      let user = await openPassword();
      await user.type(current(), OLD);
      await user.click(toggle());
      user = await replace(name(), "Grace");
      await user.click(save());
      await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
      expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/users/me", { name: "Grace" });
    });
  });

  it.each([
    ["name only", "Grace Hopper", false, { name: "Grace Hopper" }],
    ["password pair only", "Ada Lovelace", true, { current_password: OLD, new_password: NEW }],
    ["name and pair", "Grace Hopper", true, { name: "Grace Hopper", current_password: OLD, new_password: NEW }],
  ])("sends only the changed field(s): %s", async (_label, nextName, withPassword, expected) => {
    vi.mocked(apiRequest).mockResolvedValue({ id: USER.id, name: nextName, email: USER.email });
    render(<ProfileForm user={USER} />);
    let user = await replace(name(), nextName);
    if (withPassword) {
      user = await openPassword();
      await user.type(current(), OLD);
      await user.type(next(), NEW);
    }
    expect(save()).toBeEnabled();
    await user.click(save());
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/users/me", expected);
    const body = JSON.stringify(vi.mocked(apiRequest).mock.calls[0]);
    expect(body).not.toContain("email");
  });

  it("sends a trimmed name and a password exactly as typed", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ id: USER.id, name: "Grace", email: USER.email });
    render(<ProfileForm user={USER} />);
    await replace(name(), "  Grace  ");
    const user = await openPassword();
    await user.type(current(), " Old#p1 ");
    await user.type(next(), " New#p2a ");
    await user.click(save());
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/users/me", {
      name: "Grace",
      current_password: " Old#p1 ",
      new_password: " New#p2a ",
    });
  });

  it("on success reseeds, empties and closes the section, updates the context, refreshes and toasts once", async () => {
    const saved = { id: USER.id, name: "Grace", email: USER.email };
    vi.mocked(apiRequest).mockResolvedValue({ ...saved, access_token: "secret-sentinel", password_hash: "x" });
    const { container } = render(<ProfileForm user={USER} />);
    await replace(name(), "  Grace ");
    const user = await openPassword();
    await user.type(current(), OLD);
    await user.type(next(), NEW);
    await user.click(save());
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("Profile updated."));
    expect(notifySuccess).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledWith(saved); // three fields only: the parser drops the rest
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(name()).toHaveValue("Grace");
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(save()).toBeDisabled();
    expect(notifyError).not.toHaveBeenCalled();
    // The password never reaches the context, the page text or a toast.
    expect(JSON.stringify(setUser.mock.calls)).not.toContain(NEW);
    expect(JSON.stringify(vi.mocked(notifySuccess).mock.calls)).not.toContain(NEW);
  });

  it("shows the rule messages, focuses the first invalid field and sends nothing", async () => {
    render(<ProfileForm user={USER} />);
    await replace(name(), "");
    const user = await openPassword();
    await user.type(current(), OLD);
    await user.type(next(), "short");
    await user.click(save());
    expect(screen.getByText("Must be 1 to 80 characters.")).toBeVisible();
    expect(screen.getByText("Must be 8 to 10 characters.")).toBeVisible();
    expect(name()).toHaveFocus();
    expect(name()).toHaveAttribute("aria-invalid", "true");
    expect(next()).toHaveAttribute("aria-invalid", "true");
    expect(next()).toHaveValue("short");
    expect(apiRequest).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
  });

  it("focuses Current password before New password when both are invalid", async () => {
    render(<ProfileForm user={USER} />);
    const user = await openPassword();
    await user.type(current(), "x".repeat(11));
    await user.type(next(), "short");
    await user.click(save());
    expect(screen.getByText("Must be 1 to 10 characters.")).toBeVisible();
    expect(current()).toHaveFocus();
  });

  it("shows Required. under the empty half of the pair and sends nothing", async () => {
    render(<ProfileForm user={USER} />);
    const user = await openPassword();
    await user.type(next(), NEW);
    await user.click(save());
    expect(screen.getByText("Required.")).toBeVisible();
    expect(current()).toHaveAttribute("aria-invalid", "true");
    expect(current()).toHaveFocus();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("shows a wrong current password inline, keeps the section open and the text, and leaves the context alone", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      apiFailure(400, "VALIDATION_ERROR", "Check the submitted fields.", { current_password: "Current password is incorrect." }),
    );
    render(<ProfileForm user={USER} />);
    await replace(name(), "Grace");
    const user = await openPassword();
    await user.type(current(), "Wrong#pw1");
    await user.type(next(), NEW);
    await user.click(save());
    expect(await screen.findByText("Current password is incorrect.")).toBeVisible();
    expect(current()).toHaveAttribute("aria-invalid", "true");
    expect(current()).toHaveFocus();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(current()).toHaveValue("Wrong#pw1");
    expect(next()).toHaveValue(NEW);
    expect(name()).toHaveValue("Grace");
    expect(setUser).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(save()).toBeEnabled();
  });

  it("shows a 400 field message from Flask, keeps the text and shows no success", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      apiFailure(400, "VALIDATION_ERROR", "Check the submitted fields.", { name: "Must be 1 to 80 characters." }),
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
      apiFailure(400, "VALIDATION_ERROR", "Check the submitted fields.", { email: "Unknown field." }),
    );
    render(<ProfileForm user={USER} />);
    const user = await replace(name(), "Grace");
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the submitted fields.");
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
    ["a 5xx", apiFailure(503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Try again shortly.")],
    ["a transport error", new ApiError({ statusCode: null, code: "SERVICE_UNAVAILABLE", message: "Could not reach the server. Check your connection and try again." })],
    ["a rate limit", apiFailure(429, "RATE_LIMITED", "Too many attempts. Try again later.")],
  ])("%s toasts an error, keeps the text and enables Save again", async (_label, error) => {
    vi.mocked(apiRequest).mockRejectedValue(error);
    render(<ProfileForm user={USER} />);
    await replace(name(), "Grace");
    const user = await openPassword();
    await user.type(current(), OLD);
    await user.type(next(), NEW);
    await user.click(save());
    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(name()).toHaveValue("Grace");
    expect(current()).toHaveValue(OLD);
    expect(next()).toHaveValue(NEW);
    expect(save()).toBeEnabled();
    expect(setUser).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("redirects to login on AUTH_REQUIRED", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      apiFailure(401, "AUTH_REQUIRED", "Your session has ended. Sign in again."),
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

  it("after a save, a further change is measured against the new saved name", async () => {
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

  it("renders every control at the mobile size: 44 px boxes and 16 px text", async () => {
    render(<ProfileForm user={USER} />);
    await openPassword();
    for (const control of [name(), email(), current(), next(), save(), toggle()]) {
      expect(control.className).toMatch(/min-h-11/);
      expect(control.className).toMatch(/min-w-11/);
    }
    for (const field of [name(), email(), current(), next()]) expect(field.className).toMatch(/text-base/);
  });
});
