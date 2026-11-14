import { act, render, renderHook, screen } from "@testing-library/react";
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

  describe("setUser (profile save, P6)", () => {
    const ada: PublicUser = { id: "1", name: "Ada", email: "ada@example.com" };
    const wrapperFor = (user: PublicUser) =>
      function Wrapper({ children }: { children: ReactNode }) {
        return <AuthProvider user={user}>{children}</AuthProvider>;
      };

    it("replaces the user at once and keeps only the three allowed fields", () => {
      const { result } = renderHook(() => useAuth(), { wrapper: wrapperFor(ada) });
      const leaky = {
        id: "1",
        name: "Grace",
        email: "grace@example.com",
        access_token: "secret-sentinel",
        password_hash: "x",
      } as PublicUser;
      act(() => result.current.setUser(leaky));
      expect(result.current.user).toEqual({ id: "1", name: "Grace", email: "grace@example.com" });
      expect(JSON.stringify(result.current.user)).not.toMatch(/secret-sentinel|password|token/);
    });

    it("gives setUser a stable identity", () => {
      const { result, rerender } = renderHook(() => useAuth(), { wrapper: wrapperFor(ada) });
      const first = result.current.setUser;
      rerender();
      expect(result.current.setUser).toBe(first);
    });

    it("follows a changed user prop from the server", () => {
      function Harness({ user }: { user: PublicUser }) {
        return (
          <AuthProvider user={user}>
            <Show />
          </AuthProvider>
        );
      }
      const { rerender } = render(<Harness user={ada} />);
      rerender(<Harness user={{ ...ada, name: "Ada Lovelace" }} />);
      expect(JSON.parse(screen.getByTestId("user").textContent ?? "").name).toBe("Ada Lovelace");
    });

    it("keeps a setUser value while the server prop is unchanged", () => {
      function Harness({ user }: { user: PublicUser }) {
        const { setUser } = useAuth();
        return (
          <>
            <button onClick={() => setUser({ ...user, name: "Saved Name" })}>save</button>
            <Show />
          </>
        );
      }
      const { rerender } = render(
        <AuthProvider user={ada}>
          <Harness user={ada} />
        </AuthProvider>,
      );
      act(() => screen.getByRole("button", { name: "save" }).click());
      rerender(
        <AuthProvider user={{ ...ada }}>
          <Harness user={ada} />
        </AuthProvider>,
      );
      expect(JSON.parse(screen.getByTestId("user").textContent ?? "").name).toBe("Saved Name");
    });
  });
});
