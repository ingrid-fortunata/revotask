"use client";

import { useCallback } from "react";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { notifyError } from "@/lib/toast";

export type ErrorHandlerOptions = {
  /** Show field messages inline. Without it, field errors fall back to the form message. */
  onFields?: (fields: Record<string, string>) => void;
  /** Show a form-level message. Without it, the message is shown as a toast. */
  onFormError?: (message: string) => void;
};

const GENERIC_MESSAGE = "Something went wrong. Try again.";

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}

function rateLimitMessage(error: ApiError): string {
  const seconds = error.retryAfterSeconds;
  if (seconds === undefined || seconds < 1) return error.message;
  return `Too many attempts. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
}

/**
 * Maps an error to one visible outcome (AUTH-AC9.2, frontend/specs/error-handling.md).
 * Each call reports an error once: inline or form-level, a toast, or a redirect.
 */
export function useErrorHandler() {
  const handleError = useCallback((error: unknown, options: ErrorHandlerOptions = {}) => {
    if (isAbort(error)) return;
    const formMessage = (message: string) =>
      options.onFormError ? options.onFormError(message) : notifyError(message);

    if (!(error instanceof ApiError)) {
      notifyError(GENERIC_MESSAGE);
      return;
    }
    switch (error.code) {
      case "AUTH_REQUIRED": {
        const here = safeRedirectPath(window.location.pathname + window.location.search);
        hardRedirect(here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`);
        return;
      }
      case "INVALID_CREDENTIALS":
        formMessage(error.message);
        return;
      case "EMAIL_ALREADY_EXISTS":
        if (options.onFields) options.onFields({ email: error.message });
        else formMessage(error.message);
        return;
      case "VALIDATION_ERROR":
        if (error.fields && options.onFields) options.onFields(error.fields);
        else formMessage(error.message);
        return;
      case "RATE_LIMITED":
        notifyError(rateLimitMessage(error));
        return;
      default:
        // 413, 415, 403, 5xx and transport failures: fixed retry copy.
        notifyError(error.message);
    }
  }, []);

  return { handleError };
}
