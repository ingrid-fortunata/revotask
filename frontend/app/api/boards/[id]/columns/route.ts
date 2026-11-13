import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

type BoardRouteContext = { params: Promise<{ id: string }> };

// POST /api/boards/[id]/columns on the Next origin (E13). Adds a column. Admin only.
export async function POST(request: NextRequest, context: BoardRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "boardColumns",
    method: "POST",
    params: { boardId: id },
    allowedKeys: ["name", "is_done"],
    requiredKeys: ["name"],
  });
}
