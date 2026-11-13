import "server-only";

import { networkApiError } from "../errors";
import { getServerEnv } from "./env";

// The only place the access token leaves the Next.js process, and it goes to one fixed origin
// (D1, D2). Callers pick a route key from FLASK_PATHS, never a free string or URL.
export const FLASK_PATHS = {
  register: "/api/auth/register",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/users/me",
} as const;

export type FlaskRoute = keyof typeof FLASK_PATHS;

export const UPSTREAM_TIMEOUT_MS = 10_000;

export type FlaskResult = {
  status: number;
  /** The parsed JSON body, or null when the reply was empty or not JSON. */
  body: unknown;
  retryAfter: string | null;
  requestId: string;
};

export type FlaskRequest = {
  route: FlaskRoute;
  method: "GET" | "POST";
  body?: unknown;
  token?: string;
  requestId: string;
};

function logFailure(route: FlaskRoute, requestId: string, outcome: string, status?: number) {
  // Request ID, route key and outcome only. Never the token, body, URL or driver text.
  console.error(
    `flask_request_failed request_id=${requestId} route=${route} outcome=${outcome}` +
      (status === undefined ? "" : ` status=${status}`),
  );
}

export async function flaskRequest(request: FlaskRequest): Promise<FlaskResult> {
  if (!Object.hasOwn(FLASK_PATHS, request.route)) {
    throw new Error("flaskRequest: unknown route key.");
  }
  const { apiBaseUrl } = getServerEnv();
  const url = new URL(FLASK_PATHS[request.route], apiBaseUrl);
  if (url.origin !== apiBaseUrl.origin) throw new Error("flaskRequest: origin mismatch.");

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Request-ID": request.requestId,
  };
  if (request.body !== undefined) headers["Content-Type"] = "application/json";
  if (request.token) headers.Authorization = `Bearer ${request.token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    logFailure(request.route, request.requestId, name === "TimeoutError" ? "timeout" : "transport");
    throw networkApiError();
  }

  if (response.status >= 300 && response.status < 400) {
    logFailure(request.route, request.requestId, "redirect", response.status);
    throw networkApiError();
  }

  let body: unknown = null;
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return {
    status: response.status,
    body,
    retryAfter: response.headers.get("Retry-After"),
    requestId: request.requestId,
  };
}

