import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

type CommentRouteContext = { params: Promise<{ id: string }> };

// PATCH /api/comments/[id] on the Next origin (E25). Edits the caller's own comment. The body is
// exactly `content`.
export async function PATCH(request: NextRequest, context: CommentRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "comment",
    method: "PATCH",
    params: { commentId: id },
    allowedKeys: ["content"],
  });
}

// DELETE /api/comments/[id] on the Next origin (E26). Soft-deletes the caller's own comment.
export async function DELETE(request: NextRequest, context: CommentRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "comment",
    method: "DELETE",
    params: { commentId: id },
  });
}
