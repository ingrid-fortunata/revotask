"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import { BoardHeader } from "@/components/boards/BoardHeader";
import { ColumnsPlaceholder } from "@/components/boards/ColumnsPlaceholder";
import { RenameBoardForm } from "@/components/boards/RenameBoardForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiRequest } from "@/lib/apiClient";
import { BOARD_ACCESS_MESSAGE, isBoardAccessError, isForbiddenError } from "@/lib/boardErrors";
import { boardControls } from "@/lib/boardPermissions";
import { notifyError } from "@/lib/toast";
import type { BoardSummary, Membership } from "@/lib/types";

export interface BoardShellProps {
  /** Board summary only. The page keeps the columns on the server (FE-C1). */
  board: BoardSummary;
  /** Active participants from E10, read on the server. */
  members: Membership[];
  /** Members_Panel from task 5.4. Without it the shell shows the member count. */
  membersPanel?: ReactNode;
}

// Client island for the board page (FE-C1, FE-C2). It owns the header name after a rename, the
// rename form and the delete confirmation (Requirements 2.7, 3.7–3.9). Member controls are
// supplied through membersPanel so task 5.4 can add them without changing this API. Columns come
// first in the DOM and form the wide column from 1024 px; members sit in the 22 rem side column.
export function BoardShell({ board, members, membersPanel }: BoardShellProps) {
  const router = useRouter();
  const { handleError } = useErrorHandler();
  const [name, setName] = useState(board.name);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const deletePendingRef = useRef(false);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const controls = boardControls(board.role);

  function closeRename() {
    setRenameOpen(false);
    renameButtonRef.current?.focus();
  }

  function handleRenamed(updatedName: string) {
    setName(updatedName);
    closeRename();
  }

  async function handleConfirmDelete() {
    if (deletePendingRef.current) return;
    deletePendingRef.current = true;
    setDeletePending(true);
    try {
      await apiRequest<null>("DELETE", `/api/boards/${board.id}`);
      router.push("/");
    } catch (error) {
      deletePendingRef.current = false;
      setDeletePending(false);
      if (isBoardAccessError(error)) {
        notifyError(BOARD_ACCESS_MESSAGE);
        router.push("/");
        return;
      }
      if (isForbiddenError(error)) {
        handleError(error);
        setDeleteOpen(false);
        router.refresh();
        return;
      }
      // 5xx and transport failures keep the dialog open so the user can retry.
      handleError(error);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <BoardHeader
        name={name}
        role={board.role}
        renameOpen={renameOpen}
        renameButtonRef={renameButtonRef}
        onToggleRename={() => setRenameOpen((open) => !open)}
        onRequestDelete={() => setDeleteOpen(true)}
      />
      {renameOpen && controls.canRename ? (
        <div className="surface p-4 sm:p-5">
          <RenameBoardForm
            boardId={board.id}
            currentName={name}
            onRenamed={handleRenamed}
            onClose={closeRename}
          />
        </div>
      ) : null}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <ColumnsPlaceholder />
        <div className="min-w-0">
          {membersPanel ?? (
            <section aria-labelledby="members-heading" className="surface flex flex-col gap-2 p-4 sm:p-5">
              <h2 id="members-heading" className="text-lg font-semibold">
                Members
              </h2>
              <p className="break-words">
                {members.length} {members.length === 1 ? "member" : "members"}
              </p>
            </section>
          )}
        </div>
      </div>
      {controls.canDelete ? (
        <ConfirmDialog
          open={deleteOpen}
          title="Delete board?"
          message={`Delete "${name}"? Members will lose access to it.`}
          confirmLabel="Delete board"
          pending={deletePending}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteOpen(false)}
        />
      ) : null}
    </div>
  );
}
