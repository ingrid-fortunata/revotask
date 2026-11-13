import { safeLocalPath } from "./safeRedirect";

/**
 * A full page load, not a client transition. It clears the client Router Cache and all React
 * state, so a private page cannot come back after sign out and a prefetched redirect cannot
 * survive a sign in (DD7). `replace` keeps Back from returning to the page being left.
 */
export function hardRedirect(path: string): void {
  window.location.replace(safeLocalPath(path));
}
