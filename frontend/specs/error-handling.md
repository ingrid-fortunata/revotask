# Frontend Error Handling

## Typed error path

`Flask error envelope → Next Route Handler or server fetch → typed API client → field, screen, redirect or toast`

Define `ApiError` in `lib/errors.ts` with `statusCode` (nullable for transport failures), `code`, `message`, optional field errors and optional request ID. Preserve server status and stable code for expected responses. Provide safe fallback copy for network errors, timeouts, malformed responses and unexpected failures.

`hooks/useErrorHandler.ts` maps errors to the appropriate user feedback. Use `lib/toast.ts` to wrap react-hot-toast. Mount the toaster once at the app boundary. The form or page owns the local error state and avoids double reporting a failure already shown inline.

| Condition | Frontend behavior |
|---|---|
| 400 validation | Show supported fields inline and focus the first invalid input. Keep entered data. Show a form-level message for unmapped errors. |
| 401 invalid credentials | Show a generic login error inline. |
| 401 expired/revoked/missing session | Follow the SSR redirect or Route Handler cookie-clear flow, clear browser session data and send the user to login. |
| 403 forbidden | Show access feedback and keep the existing safe view. For a protected page read, render an access-denied state. |
| 404 missing resource | Page reads render a not-found state. A failed action shows a toast and refreshes or closes the affected view where appropriate. |
| 409 `POSITION_CONFLICT` | Roll back the optimistic move, refetch the authoritative board, and explain that the board changed. |
| Other 409 | Show an inline duplicate-email error or action-specific conflict feedback. Preserve input. |
| 429 | Explain the temporary limit and honor Retry-After when present. |
| 413 `CONTENT_TOO_LARGE`, 415 `UNSUPPORTED_MEDIA_TYPE` | Show fixed retry copy in a toast. These indicate a client defect and are not user-fixable. |
| 500, 503 or transport failure | Show safe retry feedback. Roll back optimistic changes. Refetch after an uncertain write outcome before allowing a retry. |
| Deliberately aborted search or poll | Suppress feedback and ignore stale results. |

Preserve a consistent pending state on forms. Present errors in text and use appropriate live regions for async feedback. Use Next.js route error boundaries for unexpected rendering failures, alongside explicit loading and not-found states. A boundary's Try again button calls `retry()`, which re-fetches the segment. `reset()` only clears the error and re-renders without re-fetching (Next.js 16.4), so it cannot recover from a failed server load. Do not add `loading.tsx` under a protected route group: the Next.js docs say `redirect()` in a streaming context emits a meta tag on the client side and not an HTTP redirect. The authentication slice keeps a plain 307 and did not test the `loading.tsx` case.

## Verification

- Test 400 field mapping, invalid login, expired or revoked protected access in browser and SSR paths, and safe retry on an unavailable API.
- Simulate an API failure after an optimistic move. Assert restoration of the original position. A 409 must restore and then refetch the board.
- Use an isolated missing-board fixture to verify that Flask 404 reaches the typed client and renders a toast for an action or a not-found state for a page. Check that no promise rejection is left unhandled.
- Verify that secrets, JWTs and traceback details do not appear in messages, screenshots or test artifacts.
