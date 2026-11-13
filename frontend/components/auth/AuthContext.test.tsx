import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import type { PublicUser } from "@/lib/types";
import { AuthProvider } from "./AuthContext";

function Show() {
  const { user } = useAuth();
  return <p data-testid="user">{JSON.stringify(user)}</p>;
}

describe("AuthProvider and useAuth", () => {
  it("provides the public user", () => {
    render(
      <AuthProvider user={{ id: "1", name: "Ada", email: "ada@example.com" }}>
        <Show />
      </AuthProvider>,
    );
    expect(JSON.parse(screen.getByTestId("user").textContent ?? "")).toEqual({
      id: "1",
      name: "Ada",
      email: "ada@example.com",
    });
  });

  it("drops any extra property, including a token or hash", () => {
    const leaky = { id: "1", name: "Ada", email: "a@b.co", access_token: "secret-sentinel", password_hash: "x" } as PublicUser;
    render(
      <AuthProvider user={leaky}>
        <Show />
      </AuthProvider>,
    );
    const text = screen.getByTestId("user").textContent ?? "";
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["email", "id", "name"]);
    expect(text).not.toMatch(/secret-sentinel|password|token/);
  });

  it("throws outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/inside AuthProvider/);
    spy.mockRestore();
  });

  it("does not store anything in web storage", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider user={{ id: "1", name: "Ada", email: "a@b.co" }}>{children}</AuthProvider>
    );
    renderHook(() => useAuth(), { wrapper });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });
});
