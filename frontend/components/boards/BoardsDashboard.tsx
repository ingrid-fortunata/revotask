"use client";

import { useState } from "react";
import { BoardList } from "@/components/boards/BoardList";
import { CreateBoardForm } from "@/components/boards/CreateBoardForm";
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
// before the router opens its page. The empty state sits above the create form (FE-C1, FE-C2).
export function BoardsDashboard({ initialBoards }: BoardsDashboardProps) {
  const [boards, setBoards] = useState<BoardSummary[]>(initialBoards);

  function handleCreated(board: BoardSummary) {
    setBoards((current) => [...current, board].sort(byNameThenId));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="break-words text-2xl font-semibold">Your boards</h1>
      {boards.length === 0 ? (
        <p className="break-words">You have no boards yet.</p>
      ) : (
        <BoardList boards={boards} />
      )}
      <section aria-labelledby="create-board-heading" className="flex flex-col gap-2">
        <h2 id="create-board-heading" className="text-lg font-semibold">
          Create a board
        </h2>
        <CreateBoardForm onCreated={handleCreated} />
      </section>
    </div>
  );
}
