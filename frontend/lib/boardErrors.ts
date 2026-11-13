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

/** True for a 409 POSITION_CONFLICT: the board changed since the client last read it (K3). */
export function isPositionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 409 && error.code === "POSITION_CONFLICT";
}

/** True for a 409 STATE_CONFLICT: a Done column rule, a nonempty column or the version limit. */
export function isStateConflict(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 409 && error.code === "STATE_CONFLICT";
}

/** True for a 400 on a move: the destination or anchor is no longer valid. No field names it. */
export function isInvalidDestination(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 400 && error.code === "VALIDATION_ERROR" && !error.fields;
}

/** True for a failure with no usable server answer: a 5xx or a transport error. The outcome is uncertain. */
export function isUncertainOutcome(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.statusCode === null || error.statusCode >= 500;
}

// Fixed copy for Kanban feedback (Requirements 9.6, 9.7, FE-D7). It never includes a card title.
export const KANBAN_MESSAGES = {
  boardChanged: "The board changed. It has been refreshed.",
  cardNotMoved: "The card was not moved. Try again.",
  cardNotMovedRefreshed: "The card was not moved. The board was refreshed.",
  columnNotMoved: "The column was not moved. Try again.",
  columnNotMovedRefreshed: "The column was not moved. The board was refreshed.",
  notSaved: "Your change was not saved. Try again.",
  accessChanged: "You no longer have permission for that action.",
  reloadFailed: "The board could not be refreshed. Reload the board to continue.",
  itemGone: "That item no longer exists. The board was refreshed.",
} as const;
