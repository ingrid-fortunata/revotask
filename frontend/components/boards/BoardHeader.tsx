import type { RefObject } from "react";
import { BaseBadge } from "@/components/shared/BaseBadge";
import { BaseButton } from "@/components/shared/BaseButton";
import { boardControls } from "@/lib/boardPermissions";
import type { BoardRole } from "@/lib/types";

export interface BoardHeaderProps {
  name: string;
  role: BoardRole;
  renameOpen: boolean;
  renameButtonRef: RefObject<HTMLButtonElement | null>;
  onToggleRename: () => void;
  onRequestDelete: () => void;
}

const ROLE_LABEL: Record<BoardRole, string> = { admin: "Admin", member: "Member" };

// Name as the h1, role badge, and Rename and Delete for Admin only (Requirements 2.7, 3.10).
// Mobile: the name wraps (min-w-0 break-words) and the buttons wrap below it (FE-S4, FE-S5).
export function BoardHeader({
  name,
  role,
  renameOpen,
  renameButtonRef,
  onToggleRename,
  onRequestDelete,
}: BoardHeaderProps) {
  const controls = boardControls(role);
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="min-w-0 break-words text-2xl font-semibold">{name}</h1>
        <BaseBadge variant={role === "admin" ? "primary" : "ghost"}>{ROLE_LABEL[role]}</BaseBadge>
      </div>
      {controls.canRename || controls.canDelete ? (
        <div className="flex flex-wrap gap-2">
          {controls.canRename ? (
            <BaseButton
              ref={renameButtonRef}
              variant="ghost"
              aria-expanded={renameOpen}
              onClick={onToggleRename}
            >
              Rename board
            </BaseButton>
          ) : null}
          {controls.canDelete ? (
            <BaseButton variant="ghost" className="text-error" onClick={onRequestDelete}>
              Delete board
            </BaseButton>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
