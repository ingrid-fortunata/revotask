import { afterEach, describe, expect, it, vi } from "vitest";
import { hardRedirect } from "./navigation";

const replace = vi.fn();

function stubLocation() {
  vi.stubGlobal("location", { ...window.location, replace });
}

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
});

describe("hardRedirect", () => {
  it("replaces the current history entry with a full page load", () => {
    stubLocation();
    hardRedirect("/login");
    expect(replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("keeps the next parameter on the login page", () => {
    stubLocation();
    hardRedirect("/login?next=%2Fboards%2Fabc");
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fboards%2Fabc");
  });

  it("never navigates to another site", () => {
    stubLocation();
    hardRedirect("//evil.example");
    hardRedirect("https://evil.example");
    expect(replace.mock.calls).toEqual([["/"], ["/"]]);
  });
});
