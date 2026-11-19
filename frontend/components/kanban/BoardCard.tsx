import type { HTMLAttributes } from "react";
import { Avatar } from "@/components/shared/Avatar";
import { BaseButton } from "@/components/shared/BaseButton";
import type { Card } from "@/lib/types";

export interface BoardCardProps {
  card: Card;
  /** True while the board is busy: the buttons are disabled (Requirement 9.8). */
  disabled: boolean;
  /** Draws the drop line above the card while a dragged card is over its drop target. */
  dropIndicator?: boolean;
  /** Drag props from `useDragAndDrop().cardProps`. */
  dragProps?: HTMLAttributes<HTMLDivElement>;
  onOpen: () => void;
  onMove: () => void;
}

// Props-only (FE-C2). A white item on the tinted lane track. The title
// opens the card detail modal (N2) and the Move button is always visible, so a touch or keyboard user can
// move the card without drag (FE-C4, Requirement 9.3). Text wraps and both buttons are 44 px.
export function BoardCard({ card, disabled, dropIndicator = false, dragProps, onOpen, onMove }: BoardCardProps) {
  return (
    <div
      {...dragProps}
      className={`flex flex-col rounded-field border bg-base-100 p-1 ${dropIndicator ? "border-primary" : "border-base-300"}`}
    >
      <BaseButton
        variant="ghost"
        className="h-auto w-full justify-start whitespace-normal break-words text-left font-medium"
        aria-label={`Open ${card.title}`}
        disabled={disabled}
        onClick={onOpen}
      >
        {card.title}
      </BaseButton>
      <div className="flex items-center justify-between gap-2 pl-4">
        <p className="flex min-w-0 items-center gap-2 text-sm text-base-content/70">
          {card.assignee_name ? <Avatar name={card.assignee_name} /> : null}
          <span className="min-w-0 break-words">{card.assignee_name ?? "Unassigned"}</span>
        </p>
        <BaseButton variant="ghost" iconOnly icon="move" aria-label={`Move ${card.title}`} disabled={disabled} onClick={onMove}>
          Move
        </BaseButton>
      </div>
    </div>
  );
}
