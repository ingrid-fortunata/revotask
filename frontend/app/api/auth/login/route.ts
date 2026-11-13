import type { NextRequest } from "next/server";
import { parsePublicUser } from "@/lib/errors";
import {
  callFlask,
  forbiddenOrigin,
  isRecord,
  loadServerEnv,
  newRequestId,
  passThrough,
  privateJson,
  readJsonObject,
  serviceUnavailable,
} from "@/lib/server/bff";
import { checkOrigin } from "@/lib/server/origin";
import { serializeCookie, sessionCookie, sessionMaxAge } from "@/lib/server/sessionCookie";

// POST /api/auth/login on the Next origin (E03). The access token goes into the HttpOnly
// session cookie and nowhere else. The browser receives the public user only.
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const env = loadServerEnv(requestId);
  if (!env.ok) return env.response;
  if (!checkOrigin(request, env.value.appOrigin)) return forbiddenOrigin(requestId);

  const body = await readJsonObject(request, ["email", "password"], requestId);
  if (!body.ok) return body.response;

  const upstream = await callFlask({ route: "login", method: "POST", body: body.body }, requestId);
  if (!upstream.ok) return upstream.response;
  const result = upstream.value;
  // Never pass a success body through: it carries the access token.
  if (result.status !== 200) {
    return result.status < 300 ? serviceUnavailable(requestId) : passThrough(result, requestId);
  }

  const data = isRecord(result.body) && isRecord(result.body.data) ? result.body.data : null;
  const token = data?.access_token;
  const maxAge =
    typeof token === "string" ? sessionMaxAge(data?.expires_in, token, Date.now() / 1000) : null;
  let user;
  try {
    user = parsePublicUser(data?.user);
  } catch {
    return serviceUnavailable(requestId);
  }
  if (typeof token !== "string" || maxAge === null) return serviceUnavailable(requestId);

  const response = privateJson({ data: { user } }, 200, requestId);
  response.headers.append("Set-Cookie", serializeCookie(sessionCookie(token, maxAge, env.value.secureCookie)));
  return response;
}
