// The only producers of redirect targets that come from user input (P10, AUTH-AC10.3).
// Both return a same-origin path and never a URL.
const PLACEHOLDER_ORIGIN = "https://app.invalid";
const MAX_LENGTH = 2048;
const LOOP_PATHS = new Set(["/login", "/register"]);

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** A same-origin path with its query, or null. The fragment is dropped. */
function localPath(value: unknown): { pathname: string; search: string } | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return null;
  // Checked on the raw string: the URL parser silently removes tabs and newlines.
  if (hasControlCharacter(value)) return null;
  // One leading slash only. "//host" and "/\host" are scheme-relative URLs to another site.
  if (!value.startsWith("/") || value[1] === "/" || value[1] === "\\") return null;
  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  return { pathname: url.pathname, search: url.search };
}

/** Any same-origin path, including /login. Used to navigate inside the app. */
export function safeLocalPath(value: unknown): string {
  const path = localPath(value);
  return path ? path.pathname + path.search : "/";
}

/**
 * Where to go after sign in. Same as `safeLocalPath`, but the sign in and register pages
 * themselves become "/", so a `next` value cannot send the user in a loop.
 */
export function safeRedirectPath(value: unknown): string {
  const path = localPath(value);
  if (!path || LOOP_PATHS.has(path.pathname.replace(/\/+$/, "") || "/")) return "/";
  return path.pathname + path.search;
}
