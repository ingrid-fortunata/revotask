import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import { notifyError } from "@/lib/toast";
import { LogoutButton } from "./LogoutButton";

vi.mock("@/lib/apiClient", () => ({ apiPost: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

beforeEach(() => {
  for (const mock of [apiPost, hardRedirect, notifyError]) vi.mocked(mock).mockReset();
});

describe("LogoutButton", () => {
  it("posts to logout, then does a full page load of /login", async () => {
    vi.mocked(apiPost).mockResolvedValue(null);
    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(hardRedirect).toHaveBeenCalledExactlyOnceWith("/login"));
    expect(apiPost).toHaveBeenCalledExactlyOnceWith("/api/auth/logout");
  });

  it("stays on the page, shows one retry toast and can be pressed again when revocation fails", async () => {
    vi.mocked(apiPost).mockRejectedValue(
      new ApiError({ statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable. Try again shortly." }),
    );
    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(hardRedirect).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button).toBeEnabled();

    vi.mocked(apiPost).mockResolvedValue(null);
    await userEvent.click(button);
    await waitFor(() => expect(hardRedirect).toHaveBeenCalledExactlyOnceWith("/login"));
  });

  it("is disabled and busy while the request is pending, and ignores a second press", async () => {
    let finish: (value: unknown) => void = () => {};
    vi.mocked(apiPost).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<LogoutButton />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    const busy = await screen.findByRole("button", { name: /Signing out/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    await user.click(busy);
    expect(apiPost).toHaveBeenCalledTimes(1);
    finish(null);
    await waitFor(() => expect(hardRedirect).toHaveBeenCalled());
  });
});
