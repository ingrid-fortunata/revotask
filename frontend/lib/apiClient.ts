import {
  apiErrorFromEnvelope,
  malformedApiError,
  networkApiError,
} from "./errors";

// Browser calls go to the same-origin Route Handlers only, with relative paths (FE-A1).
export const API_PATHS = [
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/logout",
] as const;
export type ApiPath = (typeof API_PATHS)[number];

export type ApiMethod = "POST" | "PATCH" | "DELETE";

// Board and member IDs must be canonical UUIDs, so a segment cannot carry `..`, `/`, `?` or `#` (DD13).
const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const DECLARED_BOARD_REQUESTS: ReadonlyArray<{
  method: ApiMethod;
  pattern: RegExp;
}> = [
  { method: "POST", pattern: /^\/api\/boards$/ },
  { method: "PATCH", pattern: new RegExp(`^/api/boards/${UUID}$`) },
  { method: "DELETE", pattern: new RegExp(`^/api/boards/${UUID}$`) },
  { method: "POST", pattern: new RegExp(`^/api/boards/${UUID}/members$`) },
  {
    method: "DELETE",
    pattern: new RegExp(`^/api/boards/${UUID}/members/${UUID}$`),
  },
];

/** True only for a declared method and path pair. The auth paths are declared for POST only. */
export function isDeclaredApiRequest(method: ApiMethod, path: string): boolean {
  if (typeof path !== "string") return false;
  if (method === "POST" && (API_PATHS as readonly string[]).includes(path))
    return true;
  return DECLARED_BOARD_REQUESTS.some(
    (rule) => rule.method === method && rule.pattern.test(path),
  );
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "AbortError"
  );
}

async function send<T>(
  method: ApiMethod,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw networkApiError();
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw apiErrorFromEnvelope(
      response.status,
      json,
      response.headers.get("Retry-After"),
    );
  }
  if (typeof json !== "object" || json === null || !("data" in json)) {
    throw malformedApiError(response.status);
  }
  return (json as { data: T }).data;
}

/** POST JSON to a declared path and return the unwrapped `data`. Failures throw ApiError. */
export async function apiPost<T>(
  path: ApiPath,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!API_PATHS.includes(path))
    throw new Error("apiPost: path is not declared.");
  return send<T>("POST", path, body, signal);
}

/**
 * Send a JSON request to a declared method and path and return the unwrapped `data`.
 * A pair outside the allowlist throws before fetch is called. Failures throw ApiError.
 */
export async function apiRequest<T>(
  method: ApiMethod,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!isDeclaredApiRequest(method, path))
    throw new Error("apiRequest: method and path are not declared.");
  return send<T>(method, path, body, signal);
}
