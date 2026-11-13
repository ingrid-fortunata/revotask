import type { NextRequest } from "next/server";
import { handlePrivateRead, handlePrivateWrite } from "@/lib/server/privateRoute";

type BoardMembersRouteContext = { params: Promise<{ id: string }> };

// POST /api/boards/[id]/members on the Next origin (E11). Adds a member by email. Admin only.
export async function POST(request: NextRequest, context: BoardMembersRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "boardMembers",
    method: "POST",
    params: { boardId: id },
    allowedKeys: ["email"],
  });
}

// GET /api/boards/[id]/members on the Next origin (E10). The browser rereads the members here.
export async function GET(request: NextRequest, context: BoardMembersRouteContext) {
  const { id } = await context.params;
  return handlePrivateRead(request, { route: "boardMembers", params: { boardId: id } });
}
