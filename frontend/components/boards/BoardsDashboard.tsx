"use client";

import { useId, useRef, useState } from "react";
import { BoardList } from "@/components/boards/BoardList";
import { CreateBoardForm } from "@/components/boards/CreateBoardForm";
import { BaseButton } from "@/components/shared/BaseButton";
import { BaseModal } from "@/components/shared/BaseModal";
import type { BoardSummary } from "@/lib/types";

export interface BoardsDashboardProps {
  /** The signed-in user's boards, read on the server by getBoards(). */
  initialBoards: BoardSummary[];
}

// Keeps the list in name order (ties by ID), the same order E05 returns.
function byNameThenId(a: BoardSummary, b: BoardSummary): number {
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Client island for the dashboard (DD11). The list is local state so a created board appears
// before the router opens its page. The create form lives in a modal opened by the "Create board"
// button beside the title (FE-C1, FE-C2).
export function BoardsDashboard({ initialBoards }: BoardsDashboardProps) {
  const [boards, setBoards] = useState<BoardSummary[]>(initialBoards);
  const [createOpen, setCreateOpen] = useState(false);
  const createTitleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  function handleCreated(board: BoardSummary) {
    setCreateOpen(false);
    setBoards((current) => [...current, board].sort(byNameThenId));
  }

  const adminCount = boards.filter((board) => board.role === "admin").length;
  const stats = [
    { label: "Total boards", value: boards.length },
    { label: "You manage", value: adminCount },
    { label: "You join", value: boards.length - adminCount },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight sm:text-3xl">Your boards</h1>
        <BaseButton icon="plus" onClick={() => setCreateOpen(true)}>
          Create board
        </BaseButton>
      </div>
      {boards.length > 0 ? (
        <dl className="surface grid grid-cols-3 divide-x divide-base-300">
          {stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col gap-1 p-3 sm:p-5">
              <dt className="text-sm text-base-content/70">{stat.label}</dt>
              <dd className="text-2xl font-semibold tabular-nums sm:text-3xl">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {boards.length === 0 ? (
        <div className="surface flex flex-col gap-1 border-dashed p-6">
          <p className="break-words font-medium">You have no boards yet.</p>
          <p className="break-words text-base-content/70">Create your first board to start planning with your team.</p>
        </div>
      ) : (
        <BoardList boards={boards} />
      )}
      <BaseModal open={createOpen} labelledBy={createTitleId} initialFocusRef={nameRef} onClose={() => setCreateOpen(false)}>
        <div className="flex flex-col gap-4">
          <h2 id={createTitleId} className="text-lg font-bold">
            Create a board
          </h2>
          <CreateBoardForm onCreated={handleCreated} inputRef={nameRef} />
          <div className="modal-action mt-0 flex justify-end">
            <BaseButton variant="ghost" className="w-full sm:w-auto" onClick={() => setCreateOpen(false)}>
              Cancel
            </BaseButton>
          </div>
        </div>
      </BaseModal>
    </div>
  );
}
