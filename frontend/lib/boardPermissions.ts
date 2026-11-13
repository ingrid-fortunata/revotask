// Role-based controls for the board shell and the Members_Panel (design "Screens and states",
// Requirements 3.10, 4.10, 4.13, 5.8). Only the viewer's board role decides what is shown. The server
// still enforces every rule (Requirements 3.2, 3.3, 4.7), so these helpers only hide controls.

import type { BoardRole, Membership } from "./types";

export type BoardControls = {
  canRename: boolean;
  canDelete: boolean;
  canAddMember: boolean;
};

/** Admin-only board controls. A Member gets none of them. */
export function boardControls(viewerRole: BoardRole): BoardControls {
  const isAdmin = viewerRole === "admin";
  return { canRename: isAdmin, canDelete: isAdmin, canAddMember: isAdmin };
}

/** An Admin may remove a `member` row. The admin row never shows a Remove control (DD5). */
export function canRemoveMember(viewerRole: BoardRole, row: Membership): boolean {
  return viewerRole === "admin" && row.role === "member";
}
