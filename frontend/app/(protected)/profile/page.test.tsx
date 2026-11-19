import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/server/session";
import ProfilePage from "./page";

// The real redirect() throws, so the page must not render once the session check has thrown.
const { redirectSignal } = vi.hoisted(() => ({ redirectSignal: new Error("NEXT_REDIRECT /login") }));

vi.mock("@/lib/server/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: USER, setUser: vi.fn() }) }));

const USER = { id: "1", name: "Ada Lovelace", email: "ada@example.com" };

beforeEach(() => {
  vi.mocked(getCurrentUser).mockReset().mockResolvedValue(USER);
});

describe("ProfilePage", () => {
  it("verifies the session once and renders the form with the stored values inside the dashboard main", async () => {
    const { container } = render(await ProfilePage());
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(screen.getByText(/Your email cannot be changed\./)).toBeVisible();
    expect(screen.queryByText(/not available yet/)).toBeNull();
    expect(container.querySelector("main")?.className).toBe("mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8");
    expect(container.querySelectorAll(".surface")).toHaveLength(1);
    expect(container.querySelector("input[type=password]")).toBeNull(); // the section starts closed
  });

  it("renders no token or private data into the page", async () => {
    const { container } = render(await ProfilePage());
    expect(container.innerHTML).not.toMatch(/token|bearer|session/i);
  });

  it("lets a missing session redirect before anything renders", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(redirectSignal);
    await expect(ProfilePage()).rejects.toBe(redirectSignal);
  });

  it("lets a read failure reach the error boundary", async () => {
    const failure = new ApiError({ statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "down" });
    vi.mocked(getCurrentUser).mockRejectedValue(failure);
    await expect(ProfilePage()).rejects.toBe(failure);
  });
});
