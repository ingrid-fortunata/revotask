"use client";

import { useId, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { BaseModal } from "@/components/shared/BaseModal";
import { SelectField } from "@/components/shared/SelectField";
import { isCardUnchanged } from "@/lib/kanbanMove";
import type { Card, ColumnWithCards } from "@/lib/types";

export interface MoveCardDialogProps {
  /** The card being moved. The dialog is open while this is set. */
  card: Card | null;
  columns: readonly ColumnWithCards[];
  /** True while a Kanban request or refetch holds the gate: the Move_Function would ignore the call. */
  busy?: boolean;
  /** The Move_Function. Resolves true when the move did not fail. */
  onMove: (cardId: string, columnId: string, beforeCardId: string | null) => Promise<boolean>;
  onClose: () => void;
}

export function MoveCardDialog({ card, columns, busy = false, onMove, onClose }: MoveCardDialogProps) {
  const titleId = useId();
  return (
    <BaseModal open={card !== null} labelledBy={titleId} onClose={onClose}>
      {card ? <MoveCardForm key={card.id} titleId={titleId} card={card} columns={columns} busy={busy} onMove={onMove} onClose={onClose} /> : null}
    </BaseModal>
  );
}

const END = "end";

interface MoveCardFormProps extends Omit<MoveCardDialogProps, "card"> {
  titleId: string;
  card: Card;
}

/** The place the card holds now in its column, as a position value: its next card, or the end. */
function currentPlace(columns: readonly ColumnWithCards[], card: Card): string {
  const cards = columns.find((column) => column.id === card.column_id)?.cards ?? [];
  const next = cards[cards.findIndex((item) => item.id === card.id) + 1];
  return next ? next.id : END;
}

// The keyboard and touch alternative to drag (K10, FE-C4, Requirements 9.2, 9.3). A destination
// column select and a position select ("At the end of the column" or "Before <card>") cover a move
// across columns and a reorder inside one. Confirm calls the same Move_Function as a drop. The
// defaults are the card's present column and place, so Confirm stays disabled until something changes.
function MoveCardForm({ titleId, card, columns, busy = false, onMove, onClose }: MoveCardFormProps) {
  const [columnId, setColumnId] = useState(card.column_id);
  const [position, setPosition] = useState(() => currentPlace(columns, card));
  const [pending, setPending] = useState(false);

  const destination = columns.find((column) => column.id === columnId);
  const positionOptions = [
    { value: END, label: "At the end of the column" },
    ...(destination?.cards ?? [])
      .filter((item) => item.id !== card.id)
      .map((item) => ({ value: item.id, label: `Before ${item.title}` })),
  ];

  // The Move_Function sends nothing for the card's present place (Requirement 9.9), so Confirm would
  // close the dialog with no request. Disable it instead of failing silently.
  const unchanged = isCardUnchanged(columns, card.id, columnId, position === END ? null : position);

  function handleColumnChange(next: string) {
    setColumnId(next);
    setPosition(next === card.column_id ? currentPlace(columns, card) : END);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || busy || unchanged) return;
    setPending(true);
    await onMove(card.id, columnId, position === END ? null : position);
    setPending(false);
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending} className="flex flex-col gap-4">
      <h2 id={titleId} className="break-words text-lg font-bold">
        Move card
      </h2>
      <p className="break-words text-base">{card.title}</p>
      <SelectField
        id="move-card-column"
        name="column_id"
        label="Column"
        value={columnId}
        options={columns.map((column) => ({ value: column.id, label: column.name }))}
        onChange={handleColumnChange}
      />
      <SelectField id="move-card-position" name="position" label="Position" value={position} options={positionOptions} onChange={setPosition} />
      {unchanged ? <p className="break-words text-sm opacity-80">Choose a different column or position.</p> : null}
      <div className="modal-action mt-0 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <BaseButton variant="ghost" className="w-full sm:w-auto" disabled={pending} onClick={onClose}>
          Cancel
        </BaseButton>
        <BaseButton type="submit" className="w-full sm:w-auto" loading={pending} disabled={busy || unchanged}>
          Move card
        </BaseButton>
      </div>
    </form>
  );
}
