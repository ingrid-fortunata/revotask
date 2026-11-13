import "server-only";

// Server-only settings, read lazily so `next build` needs neither variable (AUTH-AC8.8).
// Errors name the variable and never its value.

export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigError";
  }
}

// Plain http is allowed only for explicitly configured loopback development (A15, DD12).
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type ServerEnv = {
  apiBaseUrl: URL;
  appOrigin: string;
  /** True exactly when APP_ORIGIN is https. The session cookie is Secure then. */
  secureCookie: boolean;
};

function readRequired(source: Record<string, string | undefined>, name: string): string {
  const value = source[name];
  if (!value || value.trim() === "") throw new ServerConfigError(`${name}: a value is required.`);
  return value.trim();
}

function parseUrl(name: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    // The URL constructor's message echoes the input, so it is not passed on.
    throw new ServerConfigError(`${name}: not a valid URL.`);
  }
}

export function getServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const apiRaw = readRequired(source, "API_BASE_URL");
  const apiBaseUrl = parseUrl("API_BASE_URL", apiRaw);
  if (
    (apiBaseUrl.protocol !== "http:" && apiBaseUrl.protocol !== "https:") ||
    apiBaseUrl.pathname !== "/" ||
    apiBaseUrl.search !== "" ||
    apiBaseUrl.hash !== "" ||
    apiBaseUrl.username !== "" ||
    apiBaseUrl.password !== ""
  ) {
    throw new ServerConfigError("API_BASE_URL: must be an http(s) origin with no path.");
  }

  const originRaw = readRequired(source, "APP_ORIGIN");
  const appUrl = parseUrl("APP_ORIGIN", originRaw);
  if (appUrl.origin === "null" || appUrl.origin !== originRaw) {
    throw new ServerConfigError("APP_ORIGIN: must be an origin with no path or trailing slash.");
  }
  const secure = appUrl.protocol === "https:";
  if (!secure && !(appUrl.protocol === "http:" && LOOPBACK_HOSTS.has(appUrl.hostname))) {
    throw new ServerConfigError(
      "APP_ORIGIN: must be https, or http on localhost, 127.0.0.1 or [::1] for local development.",
    );
  }
  return { apiBaseUrl, appOrigin: appUrl.origin, secureCookie: secure };
}
