// Helpers for tests of Route Handlers and server modules. Not imported by application code.
import { NextRequest } from "next/server";

export const APP_ORIGIN = "http://localhost:3000";
export const API_BASE_URL = "http://127.0.0.1:5001";

export function jwtLike(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.signature-sentinel`;
}

export function validToken(secondsFromNow = 3600): string {
  return jwtLike({ sub: "u-1", exp: Math.floor(Date.now() / 1000) + secondsFromNow, jti: "j-1" });
}

export function jsonReply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function authRequest(
  path: string,
  options: { origin?: string | null; body?: unknown; raw?: string; cookie?: string; contentType?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? APP_ORIGIN;
  if (options.contentType !== null) headers["content-type"] = options.contentType ?? "application/json";
  if (options.cookie) headers.cookie = options.cookie;
  const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return new NextRequest(`${APP_ORIGIN}${path}`, { method: "POST", headers, body });
}

export function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}
