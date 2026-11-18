import { MyTasks } from "@/components/tasks/MyTasks";
import { getMyTasks } from "@/lib/server/tasks";
import { getCurrentUser } from "@/lib/server/session";

// My Tasks (Requirements 4.1 to 4.7, DD11). The session is verified here, not only in the layout
// (DD6) while getMyTasks() runs in parallel, because Flask authorizes the read too. getMyTasks() reads E21 through the server-only helper, so no token reaches the browser and
// the page makes no client request. A read failure throws to app/error.tsx. loading.tsx
// shows the skeleton while it reads.
export default async function MyTasksPage() {
  const [, tasks] = await Promise.all([getCurrentUser(), getMyTasks()]);
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <MyTasks tasks={tasks} />
    </main>
  );
}
