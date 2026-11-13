import { BoardShell } from "@/components/boards/BoardShell";
import { MembersPanel } from "@/components/boards/MembersPanel";
import { getBoard, getBoardMembers } from "@/lib/server/boards";
import { getCurrentUser } from "@/lib/server/session";

// Board page (Requirements 2.7–2.9, DD11). The session is verified here, not only in the layout
// (DD6). getBoard and getBoardMembers read E07 and E10 in parallel through the server-only helper.
// A 404 or a non-UUID id renders not-found.tsx. Only the board summary and members reach the client.
// Mobile first: padded and width-capped without full-height centering (FE-S4).
export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getCurrentUser();
  const { id } = await params;
  const [board, members] = await Promise.all([
    getBoard(id),
    getBoardMembers(id),
  ]);
  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <BoardShell
        board={{
          id: board.id,
          name: board.name,
          role: board.role,
          position_version: board.position_version,
        }}
        members={members}
        membersPanel={
          <MembersPanel
            boardId={board.id}
            viewerRole={board.role}
            members={members}
          />
        }
      />
    </main>
  );
}
