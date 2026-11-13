import type { NextRequest } from "next/server";
import {
  callFlask,
  forbiddenOrigin,
  hasEnvelope,
  loadServerEnv,
  newRequestId,
  privateJson,
  serviceUnavailable,
} from "@/lib/server/bff";
import { checkOrigin } from "@/lib/server/origin";
import { clearedSessionCookie, SESSION_COOKIE, serializeCookie } from "@/lib/server/sessionCookie";

// POST /api/auth/logout on the Next origin (E04). Idempotent for the browser: with no cookie or
// an already invalid session it clears the cookie and answers 200. If Flask cannot confirm the
// revocation, the cookie stays so the user can retry (P9).
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const env = loadServerEnv(requestId);
  if (!env.ok) return env.response;
  if (!checkOrigin(request, env.value.appOrigin)) return forbiddenOrigin(requestId);

  const signedOut = () => {
    const response = privateJson({ data: null }, 200, requestId);
    response.headers.append("Set-Cookie", serializeCookie(clearedSessionCookie(env.value.secureCookie)));
    return response;
  };

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return signedOut();

  const upstream = await callFlask({ route: "logout", method: "POST", token }, requestId);
  if (!upstream.ok) return upstream.response;
  const { status } = upstream.value;
  if ((status === 200 || status === 401) && hasEnvelope(upstream.value)) return signedOut();
  return serviceUnavailable(requestId);
}
