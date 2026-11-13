import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/server/session";
import ProtectedLayout from "./layout";

vi.mock("@/lib/server/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/apiClient", () => ({ apiPost: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

beforeEach(() => {
  vi.mocked(getCurrentUser).mockReset();
});

describe("ProtectedLayout", () => {
  it("renders the shell with the user's name around the page", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "1", name: "Ada", email: "ada@example.com" });
    render(await ProtectedLayout({ children: <p>page body</p> }));
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("renders nothing of the page when the session check throws", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("redirect"));
    await expect(ProtectedLayout({ children: <p>private</p> })).rejects.toThrow("redirect");
    expect(screen.queryByText("private")).toBeNull();
  });
});
