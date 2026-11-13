// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getServerEnv, ServerConfigError } from "./env";

const base = { API_BASE_URL: "http://127.0.0.1:5001", APP_ORIGIN: "http://localhost:3000" };

function messageFor(source: Record<string, string | undefined>): string {
  try {
    getServerEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(ServerConfigError);
    return (error as Error).message;
  }
  throw new Error("expected getServerEnv to throw");
}

describe("getServerEnv", () => {
  it("reads the foundation local configuration", () => {
    const env = getServerEnv(base);
    expect(env.apiBaseUrl.origin).toBe("http://127.0.0.1:5001");
    expect(env.appOrigin).toBe("http://localhost:3000");
    expect(env.secureCookie).toBe(false);
  });

  it.each([
    "https://app.example",
    "https://app.example:8443",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ])("accepts APP_ORIGIN %s", (origin) => {
    const env = getServerEnv({ ...base, APP_ORIGIN: origin });
    expect(env.secureCookie).toBe(origin.startsWith("https:"));
  });

  it.each([
    ["http://app.example", "plain http on a real host"],
    ["http://localhost.evil.example", "a loopback look-alike"],
    ["http://127.0.0.1.evil.example", "an address look-alike"],
    ["http://localhost:3000/", "a trailing slash"],
    ["http://localhost:3000/path", "a path"],
    ["localhost:3000", "no scheme"],
    ["ftp://localhost", "another scheme"],
    ["", "an empty value"],
  ])("rejects APP_ORIGIN %s (%s)", (origin) => {
    expect(messageFor({ ...base, APP_ORIGIN: origin })).toMatch(/^APP_ORIGIN:/);
  });

  it("rejects a missing APP_ORIGIN and API_BASE_URL by name", () => {
    expect(messageFor({ API_BASE_URL: base.API_BASE_URL })).toMatch(/^APP_ORIGIN: a value is required/);
    expect(messageFor({ APP_ORIGIN: base.APP_ORIGIN })).toMatch(/^API_BASE_URL: a value is required/);
  });

  it.each(["http://127.0.0.1:5001/api", "http://127.0.0.1:5001/?x=1", "ftp://x", "not a url", "http://u:p@h:1"])(
    "rejects API_BASE_URL %s",
    (value) => {
      expect(messageFor({ ...base, API_BASE_URL: value })).toMatch(/^API_BASE_URL:/);
    },
  );

  it("never puts a value in the error message", () => {
    const sentinel = "http://secret-sentinel-host.example/path-sentinel";
    expect(messageFor({ ...base, API_BASE_URL: sentinel })).not.toMatch(/sentinel/);
    expect(messageFor({ ...base, APP_ORIGIN: sentinel })).not.toMatch(/sentinel/);
    expect(messageFor({ ...base, APP_ORIGIN: "not a url sentinel" })).not.toMatch(/sentinel/);
  });
});
