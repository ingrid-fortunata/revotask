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

// One lane: a tinted track of 18 to 20 rem with the header, the white cards, the end drop strip
// and the add-card button. The admin controls are four 44 px icon buttons in the header row. Each card is a
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
    <section aria-labelledby={headingId} className="flex min-w-72 flex-1 flex-col gap-2 rounded-box border border-base-300 bg-base-300/40 p-2 sm:min-w-80 sm:p-3">
      <ColumnHeader
        headingId={headingId}
        name={column.name}
        count={column.cards.length}
        isDone={column.is_done}
        controls={
          isAdmin ? (
            <div className="flex shrink-0 flex-wrap justify-end">
              <BaseButton variant="ghost" iconOnly icon="chevron-left" aria-label={`Move ${column.name} left`} disabled={busy || index === 0} onClick={onMoveLeft}>
                Left
              </BaseButton>
              <BaseButton variant="ghost" iconOnly icon="chevron-right" aria-label={`Move ${column.name} right`} disabled={busy || index === total - 1} onClick={onMoveRight}>
                Right
              </BaseButton>
              <BaseButton variant="ghost" iconOnly icon="pencil" aria-label={`Edit column ${column.name}`} disabled={busy} onClick={onEditColumn}>
                Edit
              </BaseButton>
              <BaseButton variant="ghost" iconOnly icon="trash" className="text-error" aria-label={`Delete column ${column.name}`} disabled={busy} onClick={onDeleteColumn}>
                Delete
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
      {column.cards.length === 0 ? <p className="px-1 text-sm text-base-content/70">No cards yet.</p> : null}
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
        className={`flex items-center justify-center rounded-field border border-dashed text-sm text-base-content/70 ${
          dragging ? "min-h-32" : "min-h-11"
        } ${dnd.isTarget(column.id, null) ? "border-primary" : dragging ? "border-base-300" : "border-transparent"}`}
      >
        {dragging ? "Drop here to move to the end" : null}
      </div>
      <AddCardForm columnId={column.id} columnName={column.name} disabled={busy} onAdd={onAddCard} />
    </section>
  );
}
