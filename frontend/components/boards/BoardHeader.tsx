import Link from "next/link";
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
    <header className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-6">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-field px-1 text-sm text-base-content/70 hover:text-primary"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All boards
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
          <BaseBadge variant={role === "admin" ? "primary" : "ghost"}>{ROLE_LABEL[role]}</BaseBadge>
        </div>
      </div>
      {controls.canRename || controls.canDelete ? (
        <div className="flex flex-wrap gap-2">
          {controls.canRename ? (
            <BaseButton
              ref={renameButtonRef}
              variant="ghost"
              className="border-base-300"
              aria-expanded={renameOpen}
              onClick={onToggleRename}
            >
              Rename board
            </BaseButton>
          ) : null}
          {controls.canDelete ? (
            <BaseButton variant="ghost" className="border-base-300 text-error" onClick={onRequestDelete}>
              Delete board
            </BaseButton>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
