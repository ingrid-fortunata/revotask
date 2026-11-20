"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";
import { Icon } from "@/components/shared/Icon";
import { TaskGroup } from "@/components/tasks/TaskGroup";
import { SEARCH_QUERY_MAX } from "@/lib/cardSearch";
import { filterTasks, groupTasksByBoard } from "@/lib/tasks";
import type { TaskItem } from "@/lib/types";

export interface MyTasksProps {
  /** The caller's tasks in the order E21 returned them (S1). */
  tasks: TaskItem[];
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

// Body of /my-tasks (FE-C1, FE-D4): the title, the title search, a summary strip, then one group per
// board in the order the API returned them. A client component only for the search query (DD17, S17):
// the page stays a Server Component, `tasks` is serializable, and filtering is local, so typing sends
// no request and needs no debounce (S14, S15). The empty state says where assignments are made
// (FE-D7) and shows no field, because there is nothing to search.
//
// The status comes from the last server render, and the browser Back button restores an earlier
// render from Next's router cache. So the page asks the server for fresh data when it mounts and when
// the tab becomes visible again (Rev 2, 9.6). `router.refresh()` re-renders the Server Component and
// keeps this component's state (the query). It costs one extra read of E21 per visit.
// ponytail: no staleness check; add one (a render timestamp) only if the extra read matters.
export function MyTasks({ tasks }: MyTasksProps) {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);
  const [query, setQuery] = useState("");
  const fieldRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  const shown = filterTasks(tasks, query);
  const groups = groupTasksByBoard(shown);
  const filtering = trimmed !== "";

  let summary: string;
  if (!filtering) summary = `${tasks.length} ${plural(tasks.length, "task", "tasks")} on ${groups.length} ${plural(groups.length, "board", "boards")}`;
  else if (shown.length === 0) summary = `0 of ${tasks.length} ${plural(tasks.length, "task", "tasks")}`;
  else summary = `${shown.length} of ${tasks.length} ${plural(tasks.length, "task", "tasks")} on ${groups.length} ${plural(groups.length, "board", "boards")}`;
  const announcement = !filtering
    ? ""
    : shown.length === 0
      ? "No tasks match."
      : `${shown.length} ${plural(shown.length, "task", "tasks")}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight sm:text-3xl">My tasks</h1>
      {tasks.length === 0 ? (
        <div className="surface flex flex-col gap-1 border-dashed p-6">
          <p className="break-words font-medium">No cards are assigned to you.</p>
          <p className="break-words text-base-content/70">Cards assigned to you on any board appear here.</p>
        </div>
      ) : (
        <>
          <div className="relative w-full sm:max-w-sm">
            <span className="pointer-events-none absolute left-3 z-10 top-[1.375rem] -translate-y-1/2 text-base-content/50">
              <Icon name="search" className="size-4" />
            </span>
            <FormField
              id="my-tasks-search"
              name="my-tasks-search"
              label="Search my tasks"
              hideLabel
              placeholder="Search my tasks"
              inputClassName="pl-9"
              type="search"
              autoComplete="off"
              maxLength={SEARCH_QUERY_MAX}
              value={query}
              inputRef={fieldRef}
              onChange={setQuery}
            />
          </div>
          {/* aria-live without role="status", as in CardSearch. Always rendered so a change is announced. */}
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            {announcement}
          </p>
          <p className="surface p-4 sm:p-5">
            {/* Numbers in tabular-nums (FE-D5). The same sentence as text, so a test reads it whole. */}
            {summary.split(/(\d+)/).map((part, index) =>
              /^\d+$/.test(part) ? (
                <span key={index} className="tabular-nums font-semibold">
                  {part}
                </span>
              ) : (
                part
              ),
            )}
          </p>
          {shown.length === 0 ? (
            <div className="surface flex flex-col items-start gap-3 border-dashed p-6">
              <p className="min-w-0 break-words font-medium">No tasks match &ldquo;{trimmed}&rdquo;.</p>
              <BaseButton
                variant="ghost"
                onClick={() => {
                  setQuery("");
                  fieldRef.current?.focus();
                }}
              >
                Clear search
              </BaseButton>
            </div>
          ) : (
            groups.map((group) => <TaskGroup key={group.boardId} group={group} />)
          )}
        </>
      )}
    </div>
  );
}
