import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  apiErrorFromEnvelope,
  malformedApiError,
  parsePublicUser,
} from "../errors";
import type { PublicUser } from "../types";
import { isRecord, newRequestId } from "./bff";
import {
  type FlaskParams,
  type FlaskResult,
  type FlaskRoute,
  flaskRequest,
} from "./flask";
import { SESSION_COOKIE } from "./sessionCookie";

// The single place that reads the session cookie and verifies the session for Server Components
// (P8, DD6). The (protected) layout renders the shell, but it is NOT the authorization boundary:
// Next.js does not re-render a layout on client navigation. Every protected page and every
// server-side data helper or action must verify the session through this module, and Flask
// still authorizes each request with the bearer token.

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/**
 * Call Flask with the session token. No cookie, or a 401 from Flask, redirects to /login. A
 * Server Component cannot clear the cookie, so the login page tolerates a stale one.
 * `redirect()` throws, so call this outside any try/catch.
 */
export async function fetchPrivate(
  route: FlaskRoute,
  options: { method: "GET" | "POST"; body?: unknown; params?: FlaskParams; search?: string },
): Promise<FlaskResult> {
  const token = await getSessionToken();
  if (!token) redirect("/login");
  const result = await flaskRequest({
    route,
    token,
    requestId: newRequestId(),
    ...options,
  });
  if (result.status === 401) redirect("/login");
  return result;
}

/** The signed-in user's public DTO. A Flask outage or a 5xx throws ApiError and reaches app/error.tsx. */
export const getCurrentUser = cache(async (): Promise<PublicUser> => {
  const result = await fetchPrivate("me", { method: "GET" });
  if (result.status !== 200)
    throw apiErrorFromEnvelope(result.status, result.body, result.retryAfter);
  if (!isRecord(result.body) || !("data" in result.body))
    throw malformedApiError(result.status);
  return parsePublicUser(result.body.data);
});
