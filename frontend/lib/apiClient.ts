import { apiErrorFromEnvelope, malformedApiError, networkApiError } from "./errors";

// Browser calls go to the same-origin Route Handlers only, with relative paths (FE-A1).
export const API_PATHS = ["/api/auth/register", "/api/auth/login", "/api/auth/logout"] as const;
export type ApiPath = (typeof API_PATHS)[number];

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}

/** POST JSON to a declared path and return the unwrapped `data`. Failures throw ApiError. */
export async function apiPost<T>(path: ApiPath, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!API_PATHS.includes(path)) throw new Error("apiPost: path is not declared.");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
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
    throw apiErrorFromEnvelope(response.status, json, response.headers.get("Retry-After"));
  }
  if (typeof json !== "object" || json === null || !("data" in json)) {
    throw malformedApiError(response.status);
  }
  return (json as { data: T }).data;
}
