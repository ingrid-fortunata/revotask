import "server-only";

/**
 * Exact same-origin check for browser mutations (AUTH-AC8.4, P5). The Origin header must exist
 * and equal APP_ORIGIN. A missing header, "null" or any other value fails.
 */
export function checkOrigin(request: Request, appOrigin: string): boolean {
  return request.headers.get("origin") === appOrigin;
}
