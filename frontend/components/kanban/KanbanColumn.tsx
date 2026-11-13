"use client";

import { useId } from "react";
import { AddCardForm } from "@/components/kanban/AddCardForm";
import { BoardCard } from "@/components/kanban/BoardCard";
import { ColumnHeader } from "@/components/kanban/ColumnHeader";
import { BaseButton } from "@/components/shared/BaseButton";
import type { useDragAndDrop } from "@/hooks/useDragAndDrop";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import type { Card, ColumnWithCards } from "@/lib/types";

export interface KanbanColumnProps {
  column: ColumnWithCards;
  /** Zero-based position, to disable Move left on the first lane and Move right on the last. */
  index: number;
  total: number;
  isAdmin: boolean;
  /** True while the board is busy: every control here is disabled (Requirement 9.8). */
  busy: boolean;
  dnd: ReturnType<typeof useDragAndDrop>;
  /** A short explanation shown in the lane, such as why a column cannot be deleted yet. */
  notice?: string;
  onEditColumn: () => void;
  onDeleteColumn: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onOpenCard: (card: Card) => void;
  onMoveCard: (card: Card) => void;
  onAddCard: (title: string) => Promise<WriteResult<Card>>;
}

// One lane: a .surface panel of 18 rem with the header, the cards, the end drop strip and the
// add-card form (FE-D3). The admin controls are four 44 px buttons that wrap. Each card is a
// drop target meaning "before this card", and the strip at the end means "at the end" (DD10).
export function KanbanColumn({
  column,
  index,
  total,
  isAdmin,
  busy,
  dnd,
  notice,
  onEditColumn,
  onDeleteColumn,
  onMoveLeft,
  onMoveRight,
  onOpenCard,
  onMoveCard,
  onAddCard,
}: KanbanColumnProps) {
  const headingId = useId();
  const dragging = dnd.draggedId !== null;
  return (
    <section aria-labelledby={headingId} className="surface flex min-w-72 flex-1 flex-col gap-3 p-3 sm:p-4">
      <ColumnHeader
        headingId={headingId}
        name={column.name}
        count={column.cards.length}
        isDone={column.is_done}
        controls={
          isAdmin ? (
            <div className="flex flex-wrap gap-1">
              <BaseButton variant="ghost" className="border-base-300" aria-label={`Edit column ${column.name}`} disabled={busy} onClick={onEditColumn}>
                Edit
              </BaseButton>
              <BaseButton variant="ghost" className="border-base-300 text-error" aria-label={`Delete column ${column.name}`} disabled={busy} onClick={onDeleteColumn}>
                Delete
              </BaseButton>
              <BaseButton variant="ghost" className="border-base-300" aria-label={`Move ${column.name} left`} disabled={busy || index === 0} onClick={onMoveLeft}>
                Left
              </BaseButton>
              <BaseButton variant="ghost" className="border-base-300" aria-label={`Move ${column.name} right`} disabled={busy || index === total - 1} onClick={onMoveRight}>
                Right
              </BaseButton>
            </div>
          ) : undefined
        }
      />
      {notice ? (
        <p role="alert" className="break-words text-sm text-error">
          {notice}
        </p>
      ) : null}
      {column.cards.length === 0 ? <p className="text-sm text-base-content/70">No cards yet.</p> : null}
      <ul className="flex flex-col gap-2">
        {column.cards.map((card) => (
          <li key={card.id} {...dnd.dropProps(column.id, card.id)}>
            <BoardCard
              card={card}
              disabled={busy}
              dropIndicator={dnd.isTarget(column.id, card.id)}
              dragProps={dnd.cardProps(card.id)}
              onOpen={() => onOpenCard(card)}
              onMove={() => onMoveCard(card)}
            />
          </li>
        ))}
      </ul>
      <div
        {...dnd.dropProps(column.id, null)}
        className={`flex min-h-11 items-center justify-center rounded-field border border-dashed text-sm text-base-content/70 ${
          dnd.isTarget(column.id, null) ? "border-primary" : dragging ? "border-base-300" : "border-transparent"
        }`}
      >
        {dragging ? "Drop here to move to the end" : null}
      </div>
      <AddCardForm columnId={column.id} columnName={column.name} disabled={busy} onAdd={onAddCard} />
    </section>
  );
}
