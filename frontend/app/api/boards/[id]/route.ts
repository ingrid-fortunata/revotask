import type { NextRequest } from "next/server";
import { handlePrivateRead, handlePrivateWrite } from "@/lib/server/privateRoute";

type BoardRouteContext = { params: Promise<{ id: string }> };

// PATCH /api/boards/[id] on the Next origin (E08). Renames a board. Admin only.
export async function PATCH(request: NextRequest, context: BoardRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "board",
    method: "PATCH",
    params: { boardId: id },
    allowedKeys: ["name"],
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
