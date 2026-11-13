# API Integration and Session

Use the shared [HTTP contract](../../docs/API.md) and [backend API rules](../../backend/specs/api-contract.md). Keep transport details in `lib/` and state behavior in components/hooks.

## Server and browser clients

| Path | Transport and session |
|---|---|
| Server Component reads | Use a server-only Flask fetch helper. Read the Next.js HttpOnly cookie, send a bearer token only to the configured `API_BASE_URL`, and use `cache: 'no-store'` for private reads. |
| Client interaction | `lib/apiClient.ts` calls declared same-origin Next Route Handlers with relative paths. Browser JavaScript receives public DTOs. |
| Next Route Handlers | Forward allowed path/method pairs to the fixed Flask origin. Check exact `APP_ORIGIN` for browser mutations, attach the cookie-derived bearer upstream and preserve request IDs and relevant status codes. Reject upstream redirects. |
| Login and logout | Login saves `revotask_session` and returns the public user DTO. Logout revokes in Flask and clears the cookie on success or an already invalid session. Preserve the session and return a retryable error if the upstream logout outcome is unknown. |

Use `API_BASE_URL` as a server-only environment variable. AuthContext stores the public user DTO. It derives its state from an authenticated read and is refreshed after profile updates. Keep private data out of shared caches.

## Response handling

- Type requests and responses from the endpoint schemas. For a successful result, unwrap `data`. Handle explicit `data: null` where the contract allows it.
- For a non-2xx response or invalid upstream response, throw an `ApiError` using [the error contract](error-handling.md). Never consume raw Flask HTML or expose an upstream traceback.
- A protected Server Component receiving 401 redirects to `/login`. The login page tolerates a stale cookie. A protected Route Handler receiving 401 clears the cookie, and the browser clears private state and redirects. A 401 from invalid login credentials stays inline.
- Revalidate the affected view after mutations. A move response updates affected columns and `position_version`. Refetch the board if the version is stale or the network outcome is uncertain. Keep the optimistic mutation queue serialized for each active board.
- Use real data for board list, board detail, notifications and comments before acceptance. Capture sanitized browser evidence of interaction requests and server-side request IDs or logs for protected SSR reads.
