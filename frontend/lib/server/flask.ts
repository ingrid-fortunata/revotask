import "server-only";

import { networkApiError } from "../errors";
import { getServerEnv } from "./env";

// The only place the access token leaves the Next.js process, and it goes to one fixed origin
// (D1, D2). Callers pick a route key from FLASK_PATHS, never a free string or URL.
// Path parameters (`:boardId`, `:userId`, `:columnId`, `:cardId`, `:commentId`) are filled only with UUIDs (DD13, Property 14).
export const FLASK_PATHS = {
  register: "/api/auth/register",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/users/me",
  boards: "/api/boards",
  board: "/api/boards/:boardId",
  boardMembers: "/api/boards/:boardId/members",
  boardMember: "/api/boards/:boardId/members/:userId",
  boardColumns: "/api/boards/:boardId/columns",
  boardColumnsReorder: "/api/boards/:boardId/columns/reorder",
  column: "/api/columns/:columnId",
  columnCards: "/api/columns/:columnId/cards",
  card: "/api/cards/:cardId",
  cardPosition: "/api/cards/:cardId/position",
  cardComments: "/api/cards/:cardId/comments",
  comment: "/api/comments/:commentId",
  myTasks: "/api/cards",
  boardCardSearch: "/api/boards/:boardId/cards/search",
} as const;

export type FlaskRoute = keyof typeof FLASK_PATHS;

export type FlaskParamName = "boardId" | "userId" | "columnId" | "cardId" | "commentId";
export type FlaskParams = Partial<Record<FlaskParamName, string>>;

const FLASK_PARAM_NAMES: readonly FlaskParamName[] = [
  "boardId",
  "userId",
  "columnId",
  "cardId",
  "commentId",
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Each value must be a UUID. Required for every `:name` token in the route template. */
  params?: FlaskParams;
  body?: unknown;
  /**
   * A raw query string for a read: empty or starting with `?`. It is set on the final URL as sent,
   * so a repeated or unknown key reaches Flask, which validates it (S3). It cannot change the path
   * or the host, and the origin check below still runs on the final URL.
   */
  search?: string;
  token?: string;
  requestId: string;
};

// Replaces each `:name` token in the route template with its UUID. A missing or non-UUID value
// throws before any URL exists, so a segment cannot carry `..`, `/`, `?` or `#`.
function fillFlaskPath(route: FlaskRoute, params: FlaskParams = {}): string {
  return FLASK_PATHS[route].replace(/:([A-Za-z]+)/g, (_token, name: string) => {
    const key = FLASK_PARAM_NAMES.find((allowed) => allowed === name);
    const value = key === undefined ? undefined : params[key];
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
      throw new Error(`flaskRequest: path parameter ${name} must be a UUID.`);
    }
    return value;
  });
}

function logFailure(
  route: FlaskRoute,
  requestId: string,
  outcome: string,
  status?: number,
) {
  // Request ID, route key and outcome only. Never the token, body, URL or driver text.
  console.error(
    `flask_request_failed request_id=${requestId} route=${route} outcome=${outcome}` +
      (status === undefined ? "" : ` status=${status}`),
  );
}

export async function flaskRequest(
  request: FlaskRequest,
): Promise<FlaskResult> {
  if (!Object.hasOwn(FLASK_PATHS, request.route)) {
    throw new Error("flaskRequest: unknown route key.");
  }
  const { apiBaseUrl } = getServerEnv();
  // The origin check runs on the final URL, after parameter substitution (DD13).
  const url = new URL(fillFlaskPath(request.route, request.params), apiBaseUrl);
  if (request.search !== undefined) {
    if (request.search !== "" && !request.search.startsWith("?")) {
      throw new Error("flaskRequest: search must be empty or start with '?'.");
    }
    url.search = request.search;
  }
  if (url.origin !== apiBaseUrl.origin)
    throw new Error("flaskRequest: origin mismatch.");

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
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    logFailure(
      request.route,
      request.requestId,
      name === "TimeoutError" ? "timeout" : "transport",
    );
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
