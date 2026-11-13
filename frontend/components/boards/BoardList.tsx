import Link from "next/link";
import { BaseBadge } from "@/components/shared/BaseBadge";
import type { BoardRole, BoardSummary } from "@/lib/types";

export interface BoardListProps {
  boards: BoardSummary[];
}

const ROLE_LABEL: Record<BoardRole, string> = { admin: "Admin", member: "Member" };

// Six chip colors, all 4.5:1 or better against white text. The same board always gets the same
// color, so a user finds it by color as well as by name.
const CHIP_CLASS = [
  "bg-teal-700",
  "bg-sky-700",
  "bg-indigo-700",
  "bg-rose-700",
  "bg-amber-700",
  "bg-emerald-700",
] as const;

function chipClass(id: string): string {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return CHIP_CLASS[sum % CHIP_CLASS.length];
}

// Each board is one link and one tile: a row on a phone, a stacked tile from 640 px (FE-S4, FE-D3).
// The name stays the first span in the link, and it wraps instead of pushing the role badge off
// screen. The chip is a div so it never takes that place.
export function BoardList({ boards }: BoardListProps) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Your boards">
      {boards.map((board) => (
        <li key={board.id} className="min-w-0">
          <Link
            href={`/boards/${board.id}`}
            className="surface flex h-full min-h-11 min-w-11 items-center gap-3 p-3 transition-colors hover:border-primary sm:flex-col sm:items-start sm:gap-4 sm:p-5"
          >
            <div
              aria-hidden="true"
              className={`flex size-10 shrink-0 items-center justify-center rounded-field text-base font-semibold text-white ${chipClass(board.id)}`}
            >
              {Array.from(board.name.trim())[0]?.toUpperCase() ?? "?"}
            </div>
            <span className="min-w-0 flex-1 break-words text-base font-semibold sm:flex-none">{board.name}</span>
            <BaseBadge variant={board.role === "admin" ? "primary" : "ghost"} className="sm:mt-auto">
              {ROLE_LABEL[board.role]}
            </BaseBadge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
