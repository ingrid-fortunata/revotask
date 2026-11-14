"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BoardHeader } from "@/components/boards/BoardHeader";
import { MembersPanel } from "@/components/boards/MembersPanel";
import { RenameBoardForm } from "@/components/boards/RenameBoardForm";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { useKanbanBoard } from "@/hooks/useKanbanBoard";
import { apiRequest } from "@/lib/apiClient";
import { BOARD_ACCESS_MESSAGE, isBoardAccessError, isForbiddenError } from "@/lib/boardErrors";
import { boardControls } from "@/lib/boardPermissions";
import { notifyError } from "@/lib/toast";
import type { BoardSummary, ColumnWithCards, Membership } from "@/lib/types";

export interface BoardShellProps {
  /** Board summary: the name, the viewer's role and the position version. */
  board: BoardSummary;
  /** Active columns with their active cards from E07, read on the server. State is seeded once. */
  columns: ColumnWithCards[];
  /** Active participants from E10, read on the server. */
  members: Membership[];
}

// Client island for the board page (FE-C1, FE-C2). It owns the header name after a rename, the
// rename form, the delete confirmation (Requirements 2.7, 3.7–3.9) and the Kanban state. The
// Kanban hook lives here, so a member removal in the Members_Panel can ask it to refetch the
// board (Requirement 6.8, K12). The members avatars sit in the header under the title, and the
// columns take the full page width below it.
export function BoardShell({ board, columns, members }: BoardShellProps) {
  const router = useRouter();
  const { handleError } = useErrorHandler();
  const [name, setName] = useState(board.name);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const deletePendingRef = useRef(false);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const controls = boardControls(board.role);
  const kanban = useKanbanBoard({
    boardId: board.id,
    initial: { columns, version: board.position_version },
  });

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
      >
        <MembersPanel
          boardId={board.id}
          viewerRole={board.role}
          members={members}
          onMemberRemoved={kanban.requestRefresh}
        />
      </BoardHeader>
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
      <KanbanBoard boardId={board.id} role={board.role} members={members} kanban={kanban} />
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
