import type { ReactNode } from "react";
import { BaseBadge } from "@/components/shared/BaseBadge";

export interface ColumnHeaderProps {
  /** Id of the heading, so the lane can name itself with aria-labelledby. */
  headingId: string;
  name: string;
  /** Number of active cards. */
  count: number;
  isDone: boolean;
  /** Admin controls, supplied by the island. A Member gets none (Requirement 7.6). */
  controls?: ReactNode;
}

// Props-only and server-compatible (FE-C2). The Done badge carries text, not color alone
// (Requirement 6.3). Long names wrap (FE-S4).
export function ColumnHeader({ headingId, name, count, isDone, controls }: ColumnHeaderProps) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="break-words text-lg font-semibold">
            {name}
          </h3>
          <p className="text-sm tabular-nums text-base-content/70">
            {count} {count === 1 ? "card" : "cards"}
          </p>
        </div>
        {isDone ? <BaseBadge variant="primary">Done</BaseBadge> : null}
      </div>
      {controls}
    </header>
  );
}
