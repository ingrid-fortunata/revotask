import Link from "next/link";
import { chipClass } from "@/lib/boardChip";
import type { TaskGroup as TaskGroupData } from "@/lib/types";

export interface TaskGroupProps {
  group: TaskGroupData;
}

// One board's tasks inside one panel (FE-D3). The heading is a link to the board and so is each
// row, with no card ID in either URL (S9). Props-only (FE-C2). Text wraps (`break-words`,
// `min-w-0`) and every link has a 44 px box (FE-S4, FE-S5).
export function TaskGroup({ group }: TaskGroupProps) {
  const href = `/boards/${group.boardId}`;
  const headingId = `tasks-${group.boardId}`;
  return (
    <section aria-labelledby={headingId} className="surface p-4 sm:p-5">
      <h2 id={headingId} className="text-lg font-semibold">
        <Link href={href} className="flex min-h-11 min-w-11 items-center gap-3">
          <span
            aria-hidden="true"
            className={`flex size-10 shrink-0 items-center justify-center rounded-field text-base font-semibold text-white ${chipClass(group.boardId)}`}
          >
            {Array.from(group.boardName.trim())[0]?.toUpperCase() ?? "?"}
          </span>
          <span className="min-w-0 break-words">{group.boardName}</span>
        </Link>
      </h2>
      <ul className="mt-2 divide-y divide-base-300">
        {group.tasks.map((task) => (
          <li key={task.id} className="min-w-0">
            <Link
              href={href}
              aria-label={`${task.title}, ${group.boardName}`}
              className="flex min-h-11 min-w-11 flex-col justify-center gap-1 py-3"
            >
              <span className="min-w-0 break-words font-medium">{task.title}</span>
              {task.description ? (
                <span className="line-clamp-2 min-w-0 break-words text-sm text-base-content/70">{task.description}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
