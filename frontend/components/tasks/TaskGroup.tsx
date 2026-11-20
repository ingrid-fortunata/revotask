import Link from "next/link";
import { BaseBadge } from "@/components/shared/BaseBadge";
import { Icon } from "@/components/shared/Icon";
import { chipClass } from "@/lib/boardChip";
import type { TaskGroup as TaskGroupData } from "@/lib/types";

export interface TaskGroupProps {
  group: TaskGroupData;
}

// One board's tasks inside one panel (FE-D3). The heading is a link to the board and so is each
// row, with no card ID in either URL (S9). Props-only (FE-C2). Text wraps (`break-words`,
// `min-w-0`) and every link has a 44 px box (FE-S4, FE-S5). Each row shows its status as a badge (Rev 2,
// S13): the column name, with the success style and a check icon for a Done column. The badge is text
// inside the link, so the link's accessible name carries the status too (DD14). Capped at 45% of the row
// so a long column name wraps inside it and the title keeps room (DD15).
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
              aria-label={`${task.title}, ${group.boardName}, ${task.column_name}`}
              className="flex min-h-11 min-w-11 items-center gap-3 py-3"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="min-w-0 break-words font-medium">{task.title}</span>
                {task.description ? (
                  <span className="line-clamp-2 min-w-0 break-words text-sm text-base-content/70">{task.description}</span>
                ) : null}
              </span>
              <BaseBadge
                variant={task.is_done ? "success" : "ghost"}
                className="h-auto min-h-6 max-w-[45%] gap-1 whitespace-normal py-0.5 text-left"
              >
                {task.is_done ? <Icon name="check" className="size-3.5 shrink-0" /> : null}
                <span className="min-w-0 break-words">{task.column_name}</span>
              </BaseBadge>
              <span className="text-base-content/50">
                <Icon name="chevron-right" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
