import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import {
  callFlask,
  errorResponse,
  forbiddenOrigin,
  loadServerEnv,
  newRequestId,
  passThrough,
  readJsonObject,
} from "./bff";
import { checkOrigin } from "./origin";
import { FLASK_PATHS, type FlaskParams, type FlaskRoute } from "./flask";
import {
  clearedSessionCookie,
  SESSION_COOKIE,
  serializeCookie,
} from "./sessionCookie";

// Shared same-origin write path for the board Route Handlers (DD13, design 6.3). The check order
// matches the auth handlers: server environment, exact Origin (403), session cookie (401),
// UUID path parameters (400), JSON checks (415, 413, 400), then the upstream call.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export type PrivateWriteSpec = {
  route: FlaskRoute;
  method: "POST" | "PATCH" | "DELETE";
  params?: FlaskParams;
  /** Present: the body must be a JSON object with exactly these keys. Absent: no body is read. */
  allowedKeys?: readonly string[];
};

// Every `:name` token in the route template needs a UUID value in `params`.
function paramsAreUuids(route: FlaskRoute, params: FlaskParams): boolean {
  const names = [...FLASK_PATHS[route].matchAll(/:([A-Za-z]+)/g)].map(
    (match) => match[1],
  );
  return names.every((name) => {
    const value = params[name as keyof FlaskParams];
    return isUuid(value);
  });
}

function signedOut(requestId: string, secure: boolean): NextResponse {
  const response = errorResponse(
    401,
    "AUTH_REQUIRED",
    "Your session has ended. Sign in again.",
    requestId,
  );
  response.headers.append(
    "Set-Cookie",
    serializeCookie(clearedSessionCookie(secure)),
  );
  return response;
}

export async function handlePrivateWrite(
  request: NextRequest,
  spec: PrivateWriteSpec,
): Promise<NextResponse> {
  const requestId = newRequestId();
  const env = loadServerEnv(requestId);
  if (!env.ok) return env.response;
  if (!checkOrigin(request, env.value.appOrigin))
    return forbiddenOrigin(requestId);

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return signedOut(requestId, env.value.secureCookie);

  const params = spec.params ?? {};
  if (!paramsAreUuids(spec.route, params)) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "The board ID is not valid.",
      requestId,
    );
  }

  let body: unknown;
  if (spec.allowedKeys !== undefined) {
    const parsed = await readJsonObject(request, spec.allowedKeys, requestId);
    if (!parsed.ok) return parsed.response;
    body = parsed.body;
  }

  const upstream = await callFlask(
    { route: spec.route, method: spec.method, params, body, token },
    requestId,
  );
  if (!upstream.ok) return upstream.response;

  const response = passThrough(upstream.value, requestId);
  // Flask rejected the token, so the browser cookie is stale and is cleared.
  if (upstream.value.status === 401) {
    response.headers.append(
      "Set-Cookie",
      serializeCookie(clearedSessionCookie(env.value.secureCookie)),
    );
  }
  return response;
}
