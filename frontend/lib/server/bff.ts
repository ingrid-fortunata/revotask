import "server-only";

import { NextResponse } from "next/server";
import { ApiError } from "../errors";
import { getServerEnv, ServerConfigError, type ServerEnv } from "./env";
import { type FlaskRequest, type FlaskResult, flaskRequest } from "./flask";

// Shared pieces of the same-origin Route Handlers (design 6.3).
export const MAX_BODY_BYTES = 64 * 1024; // equals Flask's MAX_CONTENT_LENGTH (A14)
const BODY_MESSAGE = "The request body must be a JSON object.";

export function newRequestId(): string {
  return crypto.randomUUID();
}

function privateHeaders(requestId: string, extra?: Record<string, string>): Record<string, string> {
  return { "Cache-Control": "private, no-store", "X-Request-ID": requestId, ...extra };
}

export function privateJson(
  body: unknown,
  status: number,
  requestId: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(body, { status, headers: privateHeaders(requestId, headers) });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  options: { fields?: Record<string, string>; headers?: Record<string, string> } = {},
): NextResponse {
  const error: Record<string, unknown> = { code, message, request_id: requestId };
  if (options.fields && Object.keys(options.fields).length > 0) error.fields = options.fields;
  return privateJson({ error }, status, requestId, options.headers);
}

export function serviceUnavailable(requestId: string): NextResponse {
  return errorResponse(
    503,
    "SERVICE_UNAVAILABLE",
    "The service is temporarily unavailable. Try again shortly.",
    requestId,
  );
}

export function forbiddenOrigin(requestId: string): NextResponse {
  return errorResponse(403, "FORBIDDEN", "This request origin is not allowed.", requestId);
}

type ReadResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

async function readCapped(request: Request): Promise<Uint8Array | "too-large"> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return "too-large";
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return "too-large";
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Check the request before any upstream call, in this order (AUTH-AC8.5):
 * content type (415), size (413), JSON object (400), key set (400 with `fields`).
 * Keys outside `allowedKeys` are unknown. Every key in `requiredKeys` (default: all allowed keys,
 * the exact-key-set rule of the auth and member handlers) must be present. A handler with optional
 * keys passes a shorter `requiredKeys`.
 * The size is counted while reading, so a missing or wrong Content-Length does not help.
 */
export async function readJsonObject(
  request: Request,
  allowedKeys: readonly string[],
  requestId: string,
  requiredKeys: readonly string[] = allowedKeys,
): Promise<ReadResult> {
  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return {
      ok: false,
      response: errorResponse(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "The request must use Content-Type application/json.",
        requestId,
      ),
    };
  }
  const bytes = await readCapped(request);
  if (bytes === "too-large") {
    return {
      ok: false,
      response: errorResponse(413, "CONTENT_TOO_LARGE", "The request body is too large.", requestId),
    };
  }
  const bodyError = errorResponse(400, "VALIDATION_ERROR", BODY_MESSAGE, requestId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, response: bodyError };
  }
  if (!isRecord(parsed)) return { ok: false, response: bodyError };

  // Entries and Object.fromEntries, not `fields[key] = ...`: a "__proto__" key would hit the
  // prototype setter and vanish.
  const problems: [string, string][] = [
    ...Object.keys(parsed)
      .filter((key) => !allowedKeys.includes(key))
      .map((key): [string, string] => [key, "Unknown field."]),
    ...requiredKeys
      .filter((key) => !Object.hasOwn(parsed as object, key))
      .map((key): [string, string] => [key, "Required."]),
  ];
  if (problems.length > 0) {
    return {
      ok: false,
      response: errorResponse(400, "VALIDATION_ERROR", "Check the submitted fields.", requestId, {
        fields: Object.fromEntries(problems),
      }),
    };
  }
  return { ok: true, body: parsed };
}

function envelopeError(body: unknown): { code: string; message: string; request_id?: string; fields?: Record<string, string> } | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, message, request_id: requestId, fields } = body.error;
  if (typeof code !== "string" || typeof message !== "string") return null;
  const clean: { code: string; message: string; request_id?: string; fields?: Record<string, string> } = {
    code,
    message,
  };
  if (typeof requestId === "string") clean.request_id = requestId;
  if (isRecord(fields)) {
    const entries = Object.entries(fields).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    if (entries.length > 0) clean.fields = Object.fromEntries(entries);
  }
  return clean;
}

/**
 * Return Flask's documented success or error envelope to the browser, rebuilt from its known
 * parts. Anything else (HTML, empty, 5xx, odd statuses) becomes the fixed 503 envelope.
 */
export function passThrough(result: FlaskResult, requestId: string): NextResponse {
  if (result.status >= 200 && result.status < 300 && isRecord(result.body) && "data" in result.body) {
    return privateJson({ data: result.body.data }, result.status, requestId);
  }
  if (result.status >= 400 && result.status < 500) {
    const error = envelopeError(result.body);
    if (error) {
      const headers = result.status === 429 && result.retryAfter ? { "Retry-After": result.retryAfter } : undefined;
      return privateJson({ error }, result.status, requestId, headers);
    }
  }
  return serviceUnavailable(requestId);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the reply has the documented shape: a `data` key, or an `error` with code and message. */
export function hasEnvelope(result: FlaskResult): boolean {
  if (!isRecord(result.body)) return false;
  return "data" in result.body || envelopeError(result.body) !== null;
}

type Loaded<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

/** Read the server settings. A bad value gives the sanitized 500 and a log that names the variable. */
export function loadServerEnv(requestId: string): Loaded<ServerEnv> {
  try {
    return { ok: true, value: getServerEnv() };
  } catch (error) {
    if (!(error instanceof ServerConfigError)) throw error;
    console.error(`server_config_error request_id=${requestId} ${error.message}`);
    return {
      ok: false,
      response: errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Try again.", requestId),
    };
  }
}

/** Call Flask. A transport failure, timeout or redirect becomes the retryable 503 response. */
export async function callFlask(
  request: Omit<FlaskRequest, "requestId">,
  requestId: string,
): Promise<Loaded<FlaskResult>> {
  try {
    return { ok: true, value: await flaskRequest({ ...request, requestId }) };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, response: serviceUnavailable(requestId) };
    throw error;
  }
}
