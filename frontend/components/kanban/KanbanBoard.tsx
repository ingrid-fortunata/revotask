"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddColumnForm } from "@/components/kanban/AddColumnForm";
import { CardDetailModal } from "@/components/kanban/CardDetailModal";
import { CardSearch } from "@/components/kanban/CardSearch";
import { ColumnEditDialog } from "@/components/kanban/ColumnEditDialog";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { MoveCardDialog } from "@/components/kanban/MoveCardDialog";
import { BaseButton } from "@/components/shared/BaseButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import type { NotFoundResolution } from "@/hooks/useCardComments";
import type { useKanbanBoard } from "@/hooks/useKanbanBoard";
import { BOARD_ACCESS_MESSAGE } from "@/lib/boardErrors";
import { notifyError } from "@/lib/toast";
import type { BoardRole, Card, ColumnWithCards, Membership } from "@/lib/types";

export interface KanbanBoardProps {
  boardId: string;
  role: BoardRole;
  /** Active participants, for the assignee list. */
  members: readonly Membership[];
  /** Board state and actions from `useKanbanBoard`, owned by the board shell. */
  kanban: ReturnType<typeof useKanbanBoard>;
}

const DONE_TAKEN = "This board already has a Done column.";
const DONE_NONEMPTY = "Move or delete the cards in this column to change its Done flag.";

// The Kanban island (Requirements 6 to 9, DD9, DD10). It shows the lanes in a horizontally
// scrollable region, runs the dialogs, and sends every action through the board hook, whose gate
// allows one request at a time. Only this region scrolls sideways (FE-S2, FE-S4). Admin controls
// show for an Admin only. Every viewer gets the card controls and the Move button.
export function KanbanBoard({ boardId, role, members, kanban }: KanbanBoardProps) {
  const router = useRouter();
  const { columns, busy, status, announcement } = kanban;
  const isAdmin = role === "admin";
  const [editColumnId, setEditColumnId] = useState<string | null>(null);
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [notice, setNotice] = useState<{ columnId: string; text: string } | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [moveCardId, setMoveCardId] = useState<string | null>(null);

  const dnd = useDragAndDrop({
    enabled: !busy,
    onDrop: (cardId, columnId, beforeCardId) => void kanban.moveCard(cardId, columnId, beforeCardId),
  });

  const hasDone = columns.some((column) => column.is_done);
  const editColumn = columns.find((column) => column.id === editColumnId) ?? null;
  const deleteColumn = columns.find((column) => column.id === deleteColumnId) ?? null;
  const allCards = columns.flatMap((column) => column.cards);
  const openCard = allCards.find((card) => card.id === openCardId) ?? null;
  const moveCard = allCards.find((card) => card.id === moveCardId) ?? null;

  function doneLockedReason(column: ColumnWithCards | null): string | null {
    if (!column) return null;
    if (column.cards.length > 0) return DONE_NONEMPTY;
    if (!column.is_done && hasDone) return DONE_TAKEN;
    return null;
  }

  function handleDeleteColumn(column: ColumnWithCards) {
    if (column.cards.length > 0) {
      setNotice({ columnId: column.id, text: `Move or delete the cards in ${column.name} before deleting it.` });
      return;
    }
    setNotice(null);
    setDeleteColumnId(column.id);
  }

  async function handleConfirmDelete() {
    if (!deleteColumn || deletePending) return;
    setDeletePending(true);
    const result = await kanban.deleteColumn(deleteColumn.id);
    setDeletePending(false);
    setDeleteColumnId(null);
    if (!result.ok && !result.handled) setNotice({ columnId: deleteColumn.id, text: "That column could not be deleted. Empty it first." });
  }

  // A comment 404 is the same for a missing comment, a missing card and lost access, so the board
  // refetch decides (comments design DD10). A board 404 has already shown the access toast and left.
  async function resolveCommentNotFound(): Promise<NotFoundResolution> {
    const outcome = await kanban.refreshBoard();
    if (outcome === "gone") return "access-lost";
    if (outcome !== "applied") return "unknown";
    return openCardId !== null && kanban.hasCard(openCardId) ? "card-present" : "card-gone";
  }

  function handleMoveColumn(index: number, direction: -1 | 1) {
    const column = columns[index];
    // Left: before the previous column. Right: before the column after the next one, or the end.
    const anchor = direction === -1 ? columns[index - 1]?.id : (columns[index + 2]?.id ?? null);
    if (anchor === undefined) return;
    void kanban.moveColumn(column.id, anchor);
  }

  const empty = columns.length === 0;

  return (
    <section aria-labelledby="kanban-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="kanban-heading" className="text-lg font-semibold">
          Columns
        </h2>
        {isAdmin ? <AddColumnForm hasDone={hasDone} disabled={busy} onAdd={kanban.addColumn} /> : null}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* The search is outside the Kanban gate: it never disables a move and a move never disables it (S8). */}
      <CardSearch
        boardId={boardId}
        columns={columns}
        onOpenCard={(cardId) => setOpenCardId(cardId)}
        onAccessLost={() => {
          notifyError(BOARD_ACCESS_MESSAGE);
          router.push("/");
        }}
      />

      {status === "stale" ? (
        <div role="alert" className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="break-words">The board could not be refreshed. Reload it to continue.</p>
          <BaseButton className="w-full sm:w-auto" onClick={() => void kanban.reload()}>
            Reload board
          </BaseButton>
        </div>
      ) : null}

      {empty ? (
        <div className="surface flex flex-col gap-2 p-4 sm:p-5">
          {isAdmin ? (
            <h3 className="text-lg font-semibold">Add your first column</h3>
          ) : (
            <p className="break-words">This board has no columns yet. Ask an admin to add them.</p>
          )}
        </div>
      ) : (
        <div
          role="region"
          aria-label="Kanban columns"
          tabIndex={0}
          aria-busy={busy}
          className="flex items-start gap-3 overflow-x-auto pb-2"
        >
          {columns.map((column, index) => (
            <KanbanColumn
              key={column.id}
              column={column}
              index={index}
              total={columns.length}
              isAdmin={isAdmin}
              busy={busy}
              dnd={dnd}
              notice={notice?.columnId === column.id ? notice.text : undefined}
              onEditColumn={() => setEditColumnId(column.id)}
              onDeleteColumn={() => handleDeleteColumn(column)}
              onMoveLeft={() => handleMoveColumn(index, -1)}
              onMoveRight={() => handleMoveColumn(index, 1)}
              onOpenCard={(card: Card) => setOpenCardId(card.id)}
              onMoveCard={(card: Card) => setMoveCardId(card.id)}
              onAddCard={(title) => kanban.addCard(column.id, title)}
            />
          ))}
        </div>
      )}

      <ColumnEditDialog
        column={editColumn}
        doneLockedReason={doneLockedReason(editColumn)}
        onSave={kanban.editColumn}
        onClose={() => setEditColumnId(null)}
      />
      <ConfirmDialog
        open={deleteColumn !== null}
        title="Delete column?"
        message={deleteColumn ? `Delete the empty column "${deleteColumn.name}"?` : ""}
        confirmLabel="Delete column"
        pending={deletePending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteColumnId(null)}
      />
      <CardDetailModal
        card={openCard}
        members={members}
        onSave={kanban.editCard}
        onDelete={kanban.deleteCard}
        onClose={() => setOpenCardId(null)}
        resolveNotFound={resolveCommentNotFound}
      />
      <MoveCardDialog card={moveCard} columns={columns} onMove={kanban.moveCard} onClose={() => setMoveCardId(null)} />
    </section>
  );
}
