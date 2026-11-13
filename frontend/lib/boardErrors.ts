import { ApiError } from "./errors";

// Board-action error classification for E08, E09 and later E11 and E12 (design "Error Handling",
// Requirements 2.10, 3.9, R14). A 404 that is not USER_NOT_FOUND means the board is gone or the
// caller is no longer a participant. The message never says which, so the copy stays generic.
export const BOARD_ACCESS_MESSAGE = "You no longer have access to this board.";

/** True for a board-access 404 (the generic NOT_FOUND). USER_NOT_FOUND is an email field error. */
export function isBoardAccessError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.statusCode === 404 &&
    error.code !== "USER_NOT_FOUND"
  );
}

/** True for a 403. The caller is a Member, so the view must refresh to show the current role. */
export function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 403;
}
