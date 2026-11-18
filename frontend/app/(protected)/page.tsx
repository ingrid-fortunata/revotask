import { BoardsDashboard } from "@/components/boards/BoardsDashboard";
import { getBoards } from "@/lib/server/boards";
import { getCurrentUser } from "@/lib/server/session";

// Dashboard (Requirements 1.5–1.8, DD11). The session is verified here, not only in the layout
// (DD6) while getBoards() runs in parallel, because Flask authorizes the read too. getBoards() reads E05 through the server-only helper, so no token reaches the browser.
// Dashboard shell: padded, width-capped and without full-height centering (FE-S4).
export default async function HomePage() {
  const [, boards] = await Promise.all([getCurrentUser(), getBoards()]);
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <BoardsDashboard initialBoards={boards} />
    </main>
  );
}
