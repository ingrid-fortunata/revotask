import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

type BoardMemberRouteContext = {
  params: Promise<{ id: string; userId: string }>;
};

// DELETE /api/boards/[id]/members/[userId] on the Next origin (E12). Removes a member and clears
// that member's assignments on this board. Admin only.
export async function DELETE(request: NextRequest, context: BoardMemberRouteContext) {
  const { id, userId } = await context.params;
  return handlePrivateWrite(request, {
    route: "boardMember",
    method: "DELETE",
    params: { boardId: id, userId },
  });
}
