"use client";

import type { DragEvent } from "react";
import { useState } from "react";

export type DropTarget = { columnId: string; beforeCardId: string | null };

export interface UseDragAndDropOptions {
  /** False while the board is busy or the viewer cannot drag. Drags are then ignored. */
  enabled: boolean;
  /** Called on a drop with the card, the destination column and the anchor (null = the end). */
  onDrop: (cardId: string, columnId: string, beforeCardId: string | null) => void;
}

// Desktop drag interaction state only (design DD10, L5): which card is dragged and which target is
// under it. It holds no request logic, because a drop calls the same `moveCard` as the Move dialog.
// Native HTML5 drag does not fire on touch, which is why the Move button is always visible.
export function useDragAndDrop({ enabled, onDrop }: UseDragAndDropOptions) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);

  function reset() {
    setDraggedId(null);
    setTarget(null);
  }

  /** Props for a draggable card. */
  function cardProps(cardId: string) {
    return {
      draggable: enabled,
      "data-testid": `card-${cardId}`,
      onDragStart: (event: DragEvent) => {
        if (!enabled) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        // Firefox starts a drag only when some data is set.
        event.dataTransfer.setData("text/plain", cardId);
        setDraggedId(cardId);
      },
      onDragEnd: reset,
    };
  }

  /** Props for a drop target: before a card (`beforeCardId`) or the end of a column (null). */
  function dropProps(columnId: string, beforeCardId: string | null) {
    const testId = beforeCardId === null ? `dropzone-${columnId}-end` : `dropzone-${columnId}-before-${beforeCardId}`;
    return {
      "data-testid": testId,
      onDragOver: (event: DragEvent) => {
        if (!enabled || draggedId === null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (target?.columnId !== columnId || target.beforeCardId !== beforeCardId) {
          setTarget({ columnId, beforeCardId });
        }
      },
      onDrop: (event: DragEvent) => {
        if (!enabled || draggedId === null) return;
        event.preventDefault();
        event.stopPropagation();
        const cardId = draggedId;
        reset();
        // Dropping a card onto itself changes nothing.
        if (beforeCardId === cardId) return;
        onDrop(cardId, columnId, beforeCardId);
      },
    };
  }

  /** True while this target is under the dragged card, so the UI can draw the drop line. */
  function isTarget(columnId: string, beforeCardId: string | null): boolean {
    return target !== null && target.columnId === columnId && target.beforeCardId === beforeCardId;
  }

  return { draggedId, target, cardProps, dropProps, isTarget };
}
