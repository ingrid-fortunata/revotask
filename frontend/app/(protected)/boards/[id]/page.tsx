import { BoardShell } from "@/components/boards/BoardShell";
import { getBoard, getBoardMembers } from "@/lib/server/boards";
import { getCurrentUser } from "@/lib/server/session";

// Board page (Requirements 2.7–2.9, DD11). The session is verified here, not only in the layout
// (DD6) in the same parallel step. getBoard and getBoardMembers read E07 and E10 through the server-only helper.
// A 404 or a non-UUID id renders not-found.tsx. The summary, the columns with their cards and the
// members reach the client island, which seeds its Kanban state from them once and refetches on
// its own afterwards (kanban DD11). No token reaches the browser.
// Dashboard shell: padded, full width so the columns use the whole screen (FE-S4).
export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [, board, members] = await Promise.all([
    getCurrentUser(),
    getBoard(id),
    getBoardMembers(id),
  ]);
  return (
    <main className="w-full p-4 sm:p-6 lg:p-8">
      <BoardShell
        board={{
          id: board.id,
          name: board.name,
          role: board.role,
          position_version: board.position_version,
          sprint_start: board.sprint_start,
          sprint_end: board.sprint_end,
        }}
        columns={board.columns}
        members={members}
      />
    </main>
  );
}
