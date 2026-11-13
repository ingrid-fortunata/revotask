import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import { notifyError } from "@/lib/toast";
import { useErrorHandler } from "./useErrorHandler";

vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const apiError = (statusCode: number | null, code: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ statusCode, code, message: `msg for ${code}`, ...extra });

function setup() {
  const onFields = vi.fn();
  const onFormError = vi.fn();
  const { result } = renderHook(() => useErrorHandler());
  const run = (error: unknown) => result.current.handleError(error, { onFields, onFormError });
  return { run, onFields, onFormError };
}

function outcomes() {
  return {
    redirect: vi.mocked(hardRedirect).mock.calls.length,
    toast: vi.mocked(notifyError).mock.calls.length,
  };
}

beforeEach(() => {
  vi.mocked(hardRedirect).mockReset();
  vi.mocked(notifyError).mockReset();
  window.history.pushState({}, "", "/");
});

describe("useErrorHandler", () => {
  it("shows 400 field errors inline once, with no toast", () => {
    const { run, onFields, onFormError } = setup();
    run(apiError(400, "VALIDATION_ERROR", { fields: { email: "Enter a valid email address." } }));
    expect(onFields).toHaveBeenCalledExactlyOnceWith({ email: "Enter a valid email address." });
    expect(onFormError).not.toHaveBeenCalled();
    expect(outcomes()).toEqual({ redirect: 0, toast: 0 });
  });

  it("shows a 400 without fields as a form-level message", () => {
    const { run, onFields, onFormError } = setup();
    run(apiError(400, "VALIDATION_ERROR"));
    expect(onFormError).toHaveBeenCalledExactlyOnceWith("msg for VALIDATION_ERROR");
    expect(onFields).not.toHaveBeenCalled();
  });

  it("shows invalid credentials as the generic form-level message only", () => {
    const { run, onFormError, onFields } = setup();
    run(apiError(401, "INVALID_CREDENTIALS"));
    expect(onFormError).toHaveBeenCalledExactlyOnceWith("msg for INVALID_CREDENTIALS");
    expect(onFields).not.toHaveBeenCalled();
    expect(outcomes()).toEqual({ redirect: 0, toast: 0 });
  });

  it("puts a duplicate email on the email field", () => {
    const { run, onFields, onFormError } = setup();
    run(apiError(409, "EMAIL_ALREADY_EXISTS"));
    expect(onFields).toHaveBeenCalledExactlyOnceWith({ email: "msg for EMAIL_ALREADY_EXISTS" });
    expect(onFormError).not.toHaveBeenCalled();
  });

  it("redirects to plain /login when the session ended on the home page", () => {
    const { run, onFormError } = setup();
    run(apiError(401, "AUTH_REQUIRED"));
    expect(hardRedirect).toHaveBeenCalledExactlyOnceWith("/login");
    expect(onFormError).not.toHaveBeenCalled();
    expect(outcomes().toast).toBe(0);
  });

  it("redirects to /login with the current safe path as next", () => {
    window.history.pushState({}, "", "/boards/abc?tab=1");
    const { run } = setup();
    run(apiError(401, "AUTH_REQUIRED"));
    expect(hardRedirect).toHaveBeenCalledWith("/login?next=%2Fboards%2Fabc%3Ftab%3D1");
  });

  it("does not write next for the login or register page themselves", () => {
    for (const path of ["/login", "/register"]) {
      vi.mocked(hardRedirect).mockReset();
      window.history.pushState({}, "", path);
      setup().run(apiError(401, "AUTH_REQUIRED"));
      expect(hardRedirect).toHaveBeenCalledWith("/login");
    }
  });

  it("says how long to wait on 429 when Retry-After is known", () => {
    setup().run(apiError(429, "RATE_LIMITED", { retryAfterSeconds: 42 }));
    expect(notifyError).toHaveBeenCalledExactlyOnceWith("Too many attempts. Try again in 42 seconds.");
    vi.mocked(notifyError).mockReset();
    setup().run(apiError(429, "RATE_LIMITED", { retryAfterSeconds: 1 }));
    expect(notifyError).toHaveBeenCalledWith("Too many attempts. Try again in 1 second.");
    vi.mocked(notifyError).mockReset();
    setup().run(apiError(429, "RATE_LIMITED"));
    expect(notifyError).toHaveBeenCalledWith("msg for RATE_LIMITED");
  });

  it.each([
    [413, "CONTENT_TOO_LARGE"],
    [415, "UNSUPPORTED_MEDIA_TYPE"],
    [403, "FORBIDDEN"],
    [500, "INTERNAL_ERROR"],
    [503, "SERVICE_UNAVAILABLE"],
    [null, "SERVICE_UNAVAILABLE"],
  ])("shows %s %s as one toast and nothing inline", (status, code) => {
    const { run, onFields, onFormError } = setup();
    run(apiError(status, code));
    expect(notifyError).toHaveBeenCalledExactlyOnceWith(`msg for ${code}`);
    expect(onFields).not.toHaveBeenCalled();
    expect(onFormError).not.toHaveBeenCalled();
  });

  it("ignores an aborted request", () => {
    const { run, onFields, onFormError } = setup();
    run(Object.assign(new Error("aborted"), { name: "AbortError" }));
    expect(outcomes()).toEqual({ redirect: 0, toast: 0 });
    expect(onFields).not.toHaveBeenCalled();
    expect(onFormError).not.toHaveBeenCalled();
  });

  it("shows safe copy for an error that is not an ApiError", () => {
    setup().run(new Error("TypeError: secret internals"));
    expect(notifyError).toHaveBeenCalledExactlyOnceWith("Something went wrong. Try again.");
  });

  it("falls back to a toast when the caller gave no inline handlers", () => {
    const { result } = renderHook(() => useErrorHandler());
    result.current.handleError(apiError(401, "INVALID_CREDENTIALS"));
    expect(notifyError).toHaveBeenCalledExactlyOnceWith("msg for INVALID_CREDENTIALS");
  });
});
