import { describe, expect, it } from "vitest";
import { boardControls, canRemoveMember } from "./boardPermissions";
import type { BoardRole, Membership } from "./types";

// Property 13: Role-based controls. The pure helpers decide which controls exist for a viewer
// role and membership row. The render assertions for MembersPanel and BoardHeader live in the FT6
// test files (task 6.6), not here.
// **Validates: Requirements 3.10, 4.10, 4.13, 5.8, 7.10**
const TAG = "Feature: boards-membership, Property 13: Role-based controls";

const ROLES: BoardRole[] = ["admin", "member"];

// A fixed list of membership rows: one admin row and several member rows with different names.
const ADMIN_ROW: Membership = {
  user_id: "11111111-1111-4111-8111-111111111111",
  name: "Ada Admin",
  role: "admin",
};
const MEMBERSHIP_ROWS: Membership[] = [
  ADMIN_ROW,
  {
    user_id: "22222222-2222-4222-8222-222222222222",
    name: "Ben Member",
    role: "member",
  },
  {
    user_id: "33333333-3333-4333-8333-333333333333",
    name: "Cara Member",
    role: "member",
  },
  {
    user_id: "44444444-4444-4444-8444-444444444444",
    name: "Dion Member",
    role: "member",
  },
];

describe(TAG, () => {
  it.each([
    ["admin", { canRename: true, canDelete: true, canAddMember: true }],
    ["member", { canRename: false, canDelete: false, canAddMember: false }],
  ] as const)(
    `board controls for viewer role %s (Requirements 3.10, 4.10, 4.13, 5.8)`,
    (role, expected) => {
      expect(boardControls(role)).toEqual(expected);
    },
  );

  it.each(
    ROLES.flatMap((viewerRole) =>
      MEMBERSHIP_ROWS.map(
        (row) =>
          [
            viewerRole,
            row.name,
            row,
            viewerRole === "admin" && row.role === "member",
          ] as const,
      ),
    ),
  )(
    `viewer %s, row %s shows Remove only when viewer is admin and row is member`,
    (viewerRole, _name, row, expected) => {
      expect(canRemoveMember(viewerRole, row)).toBe(expected);
    },
  );

  it.each(ROLES)(
    `viewer role %s never gets a Remove control for the admin row (Requirements 5.8)`,
    (viewerRole) => {
      expect(canRemoveMember(viewerRole, ADMIN_ROW)).toBe(false);
    },
  );

  it.each(ROLES)(
    `admin-only board controls match the viewer role %s (Requirements 3.10)`,
    (viewerRole) => {
      const controls = boardControls(viewerRole);
      const isAdmin = viewerRole === "admin";
      expect(controls.canRename).toBe(isAdmin);
      expect(controls.canDelete).toBe(isAdmin);
      expect(controls.canAddMember).toBe(isAdmin);
    },
  );
});
