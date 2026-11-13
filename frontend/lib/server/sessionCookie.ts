import "server-only";

// The session cookie is host-only (no Domain), HttpOnly, SameSite=Lax and Path=/. Its lifetime
// never exceeds the access token's (AUTH-AC8.2, DD12, DD13).
export const SESSION_COOKIE = "revotask_session";

const MAX_EXPIRES_IN_SECONDS = 86_400;

export type SessionCookie = {
  name: typeof SESSION_COOKIE;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
};

export function sessionCookie(token: string, maxAge: number, secure: boolean): SessionCookie {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
    secure,
  };
}

/**
 * The Set-Cookie header value. Written by hand and added with `headers.append`, because
 * `NextResponse.cookies` also copies the cookie into an internal `x-middleware-set-cookie`
 * header, which would put the token in a second response header. The token is base64url text
 * with dots, so it needs no encoding.
 */
export function serializeCookie(cookie: SessionCookie): string {
  const parts = [
    `${cookie.name}=${cookie.value}`,
    `Path=${cookie.path}`,
    `Max-Age=${cookie.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (cookie.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Repeats Path, SameSite and Secure so the browser matches and removes the original cookie. */
export function clearedSessionCookie(secure: boolean): SessionCookie {
  return sessionCookie("", 0, secure);
}

/**
 * The cookie lifetime in seconds: the smaller of `expires_in` and the whole seconds left until
 * the token's `exp`. `exp` is read from the payload without verifying the signature, because
 * Flask has already verified the token. It can only shorten the cookie. Returns null when
 * either value is unusable, and the caller then treats the reply as malformed.
 */
export function sessionMaxAge(expiresIn: unknown, token: string, nowSeconds: number): number | null {
  if (
    typeof expiresIn !== "number" ||
    !Number.isInteger(expiresIn) ||
    expiresIn < 1 ||
    expiresIn > MAX_EXPIRES_IN_SECONDS
  ) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part === "")) return null;
  let exp: unknown;
  try {
    exp = (JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: unknown }).exp;
  } catch {
    return null;
  }
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  const remaining = Math.floor(exp - nowSeconds);
  if (remaining < 1) return null;
  return Math.min(expiresIn, remaining);
}
