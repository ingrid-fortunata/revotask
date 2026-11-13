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

  const adminCount = boards.filter((board) => board.role === "admin").length;
  const stats = [
    { label: "Total boards", value: boards.length },
    { label: "You manage", value: adminCount },
    { label: "You join", value: boards.length - adminCount },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">Your boards</h1>
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {boards.length === 0 ? (
            <div className="surface flex flex-col gap-1 border-dashed p-6">
              <p className="break-words font-medium">You have no boards yet.</p>
              <p className="break-words text-base-content/70">Create your first board to start planning with your team.</p>
            </div>
          ) : (
            <BoardList boards={boards} />
          )}
        </div>
        <section
          aria-labelledby="create-board-heading"
          className="surface flex flex-col gap-3 p-4 sm:p-5 lg:col-start-2 lg:row-start-1"
        >
          <h2 id="create-board-heading" className="text-lg font-semibold">
            Create a board
          </h2>
          <CreateBoardForm onCreated={handleCreated} />
        </section>
      </div>
    </div>
  );
}
