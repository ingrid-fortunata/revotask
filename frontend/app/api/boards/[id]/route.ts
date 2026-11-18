import type { NextRequest } from "next/server";
import { handlePrivateRead, handlePrivateWrite } from "@/lib/server/privateRoute";

type BoardRouteContext = { params: Promise<{ id: string }> };

// PATCH /api/boards/[id] on the Next origin (E08). Changes the name, the sprint pair or both. Admin
// only. At least one key is required, and Flask answers an empty body with 400 (Requirement 8.7).
export async function PATCH(request: NextRequest, context: BoardRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "board",
    method: "PATCH",
    params: { boardId: id },
    allowedKeys: ["name", "sprint_start", "sprint_end"],
    requiredKeys: [],
  });
}

// DELETE /api/boards/[id] on the Next origin (E09). Soft-deletes a board. Admin only.
export async function DELETE(request: NextRequest, context: BoardRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "board",
    method: "DELETE",
    params: { boardId: id },
  });
}

// GET /api/boards/[id] on the Next origin (E07). The browser refetches the board here (DD11).
export async function GET(request: NextRequest, context: BoardRouteContext) {
  const { id } = await context.params;
  return handlePrivateRead(request, { route: "board", params: { boardId: id } });
}
