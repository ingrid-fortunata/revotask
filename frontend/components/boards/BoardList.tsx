import Link from "next/link";
import { BaseBadge } from "@/components/shared/BaseBadge";
import type { BoardRole, BoardSummary } from "@/lib/types";

export interface BoardListProps {
  boards: BoardSummary[];
}

const ROLE_LABEL: Record<BoardRole, string> = { admin: "Admin", member: "Member" };

// Each board is one link with a 44 px tappable row (FE-S5). The name wraps instead of pushing the
// role badge off screen (FE-S4, Mobile design table).
export function BoardList({ boards }: BoardListProps) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Your boards">
      {boards.map((board) => (
        <li key={board.id}>
          <Link
            href={`/boards/${board.id}`}
            className="flex min-h-11 min-w-11 items-center justify-between gap-2 rounded-box bg-base-100 px-4 py-2 shadow hover:bg-base-200"
          >
            <span className="min-w-0 break-words font-medium">{board.name}</span>
            <BaseBadge variant={board.role === "admin" ? "primary" : "ghost"}>
              {ROLE_LABEL[board.role]}
            </BaseBadge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
