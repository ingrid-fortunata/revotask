import type { PublicUser } from "./types";

// Codes the UI knows how to show. Any other code gets fixed fallback copy, so an unexpected
// upstream message never reaches the screen.
export type KnownErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "AUTH_REQUIRED"
  | "EMAIL_ALREADY_EXISTS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "USER_NOT_FOUND"
  | "STATE_CONFLICT"
  | "CONTENT_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const FALLBACK_COPY: Record<KnownErrorCode, string> = {
  VALIDATION_ERROR: "Check the submitted fields.",
  INVALID_CREDENTIALS: "Invalid email or password.",
  AUTH_REQUIRED: "Your session has ended. Sign in again.",
  EMAIL_ALREADY_EXISTS: "An account with this email already exists.",
  FORBIDDEN: "This request was not allowed.",
  NOT_FOUND: "That item was not found.",
  USER_NOT_FOUND: "No registered user has this email.",
  STATE_CONFLICT: "That change conflicts with the current state.",
  CONTENT_TOO_LARGE:
    "The request could not be sent. Reload the page and try again.",
  UNSUPPORTED_MEDIA_TYPE:
    "The request could not be sent. Reload the page and try again.",
  RATE_LIMITED: "Too many attempts. Try again later.",
  SERVICE_UNAVAILABLE:
    "The service is temporarily unavailable. Try again shortly.",
  INTERNAL_ERROR: "Something went wrong. Try again.",
};

export const NETWORK_ERROR_COPY =
  "Could not reach the server. Check your connection and try again.";
const GENERIC_COPY = FALLBACK_COPY.INTERNAL_ERROR;

export type ApiErrorInit = {
  statusCode: number | null;
  code: string;
  message: string;
  fields?: Record<string, string>;
  requestId?: string;
  retryAfterSeconds?: number;
};

export class ApiError extends Error {
  readonly statusCode: number | null;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.statusCode = init.statusCode;
    this.code = init.code;
    this.fields = init.fields;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isKnownCode(code: unknown): code is KnownErrorCode {
  return typeof code === "string" && Object.hasOwn(FALLBACK_COPY, code);
}

/** Seconds from a Retry-After header. HTTP dates and unusable values give undefined. */
export function parseRetryAfter(
  value: string | null | undefined,
): number | undefined {
  if (!value || !/^\d+(\.\d+)?$/.test(value.trim())) return undefined;
  const seconds = Math.ceil(Number(value));
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function cleanFields(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** A failure to reach the server: no HTTP status, fixed safe copy. */
export function networkApiError(): ApiError {
  return new ApiError({
    statusCode: null,
    code: "SERVICE_UNAVAILABLE",
    message: NETWORK_ERROR_COPY,
  });
}

/** A reply that is not the documented shape (HTML, empty, wrong fields). */
export function malformedApiError(statusCode: number | null = null): ApiError {
  return new ApiError({
    statusCode,
    code: "SERVICE_UNAVAILABLE",
    message: FALLBACK_COPY.SERVICE_UNAVAILABLE,
  });
}

/** Build an ApiError from an HTTP status and a parsed JSON body, never from raw text. */
export function apiErrorFromEnvelope(
  statusCode: number,
  body: unknown,
  retryAfterHeader?: string | null,
): ApiError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  if (!error || typeof error.code !== "string")
    return malformedApiError(statusCode);
  const known = isKnownCode(error.code);
  const serverMessage =
    typeof error.message === "string" &&
    error.message.length > 0 &&
    error.message.length <= 200
      ? error.message
      : null;
  return new ApiError({
    statusCode,
    code: error.code,
    message: known
      ? (serverMessage ?? FALLBACK_COPY[error.code as KnownErrorCode])
      : GENERIC_COPY,
    fields: cleanFields(error.fields),
    requestId:
      typeof error.request_id === "string" ? error.request_id : undefined,
    retryAfterSeconds: parseRetryAfter(retryAfterHeader),
  });
}

/** Keep only id, name and email. Anything else, including a token, is dropped. */
export function parsePublicUser(value: unknown): PublicUser {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.email !== "string"
  ) {
    throw malformedApiError();
  }
  return { id: value.id, name: value.name, email: value.email };
}
