"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AddMemberForm } from "@/components/boards/AddMemberForm";
import { Avatar } from "@/components/shared/Avatar";
import { BaseBadge } from "@/components/shared/BaseBadge";
import { BaseButton } from "@/components/shared/BaseButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiRequest } from "@/lib/apiClient";
import { BOARD_ACCESS_MESSAGE, isBoardAccessError, isForbiddenError } from "@/lib/boardErrors";
import { boardControls, canRemoveMember } from "@/lib/boardPermissions";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import type { BoardRole, Membership } from "@/lib/types";

export interface MembersPanelProps {
  boardId: string;
  /** The viewer's role on this board. Decides which controls render (Requirements 4.10, 4.13). */
  viewerRole: BoardRole;
  /** Active participants from E10, read on the server, in server order. */
  members: Membership[];
}

const ROLE_LABEL: Record<BoardRole, string> = { admin: "Admin", member: "Member" };

// Members_Panel (Requirements 4.9–4.15, 5.6–5.8). Admin sees the add-by-email form and Remove on
// member rows. Member sees the list only. Local rows change at once after a successful E11 or E12,
// and router.refresh() then re-reads E10 so the server order and content win (R14).
// Mobile: rows wrap, names break, and every control is at least 44 by 44 px (FE-S4, FE-S5).
export function MembersPanel({ boardId, viewerRole, members }: MembersPanelProps) {
  const router = useRouter();
  const { handleError } = useErrorHandler();
  const [rows, setRows] = useState(members);
  const [sourceMembers, setSourceMembers] = useState(members);
  // Replace local rows when the server sends a new list (after router.refresh). This is the React
  // pattern for adjusting state from a changed prop, not a setState inside an effect.
  if (sourceMembers !== members) {
    setSourceMembers(members);
    setRows(members);
  }
  const [target, setTarget] = useState<Membership | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const removePendingRef = useRef(false);
  const controls = boardControls(viewerRole);

  function handleAdded(membership: Membership) {
    setRows((current) => [...current, membership]);
  }

  async function handleConfirmRemove() {
    const row = target;
    if (!row || removePendingRef.current) return;
    removePendingRef.current = true;
    setRemovePending(true);
    try {
      await apiRequest<null>("DELETE", `/api/boards/${boardId}/members/${row.user_id}`);
      setRows((current) => current.filter((item) => item.user_id !== row.user_id));
      setTarget(null);
      router.refresh();
    } catch (error) {
      if (isBoardAccessError(error)) {
        notifyError(BOARD_ACCESS_MESSAGE);
        router.push("/");
        return;
      }
      if (isForbiddenError(error) || (error instanceof ApiError && error.statusCode === 409)) {
        // The row stays. The toast explains, and refresh shows the current membership and role.
        handleError(error);
        setTarget(null);
        router.refresh();
        return;
      }
      // 5xx and transport failures keep the dialog open so the user can retry.
      handleError(error);
    } finally {
      removePendingRef.current = false;
      setRemovePending(false);
    }
  }

  return (
    <section aria-labelledby="members-heading" className="surface flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="members-heading" className="text-lg font-semibold">
          Members
        </h2>
        <p className="text-sm tabular-nums text-base-content/70">{rows.length}</p>
      </div>
      {controls.canAddMember ? <AddMemberForm boardId={boardId} onAdded={handleAdded} /> : null}
      <ul className="flex flex-col divide-y divide-base-300">
        {rows.map((row) => (
          <li key={row.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <Avatar name={row.name} />
            <span className="min-w-0 flex-1 break-words font-medium">{row.name}</span>
            <div className="flex items-center gap-2">
              <BaseBadge variant={row.role === "admin" ? "primary" : "ghost"}>
                {ROLE_LABEL[row.role]}
              </BaseBadge>
              {canRemoveMember(viewerRole, row) ? (
                <BaseButton
                  variant="ghost"
                  className="text-error"
                  aria-label={`Remove ${row.name}`}
                  onClick={() => setTarget(row)}
                >
                  Remove
                </BaseButton>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={target !== null}
        title="Remove member?"
        message={
          target
            ? `Remove ${target.name} from this board? They will lose access, and their card assignments on this board will be cleared.`
            : ""
        }
        confirmLabel="Remove member"
        pending={removePending}
        onConfirm={handleConfirmRemove}
        onCancel={() => setTarget(null)}
      />
    </section>
  );
}
