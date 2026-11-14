import { TaskGroup } from "@/components/tasks/TaskGroup";
import { groupTasksByBoard } from "@/lib/tasks";
import type { TaskItem } from "@/lib/types";

export interface MyTasksProps {
  /** The caller's tasks in the order E21 returned them (S1). */
  tasks: TaskItem[];
}

// Props-only page body for /my-tasks (FE-C1, FE-C2, FE-D4): the title, a summary strip, then one
// group per board in the order the API returned them. The empty state says where assignments are
// made (FE-D7).
export function MyTasks({ tasks }: MyTasksProps) {
  const groups = groupTasksByBoard(tasks);
  const taskLabel = tasks.length === 1 ? "task" : "tasks";
  const boardLabel = groups.length === 1 ? "board" : "boards";
  return (
    <div className="flex flex-col gap-6">
      <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight sm:text-3xl">My tasks</h1>
      {groups.length === 0 ? (
        <div className="surface flex flex-col gap-1 border-dashed p-6">
          <p className="break-words font-medium">No cards are assigned to you.</p>
          <p className="break-words text-base-content/70">Cards assigned to you on any board appear here.</p>
        </div>
      ) : (
        <>
          <p className="surface p-4 sm:p-5">
            <span className="tabular-nums font-semibold">{tasks.length}</span> {taskLabel} on{" "}
            <span className="tabular-nums font-semibold">{groups.length}</span> {boardLabel}
          </p>
          {groups.map((group) => (
            <TaskGroup key={group.boardId} group={group} />
          ))}
        </>
      )}
    </div>
  );
}
