import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

type ColumnRouteContext = { params: Promise<{ id: string }> };

// POST /api/columns/[id]/cards on the Next origin (E17). Adds a card at the end of the column.
export async function POST(request: NextRequest, context: ColumnRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "columnCards",
    method: "POST",
    params: { columnId: id },
    allowedKeys: ["title", "description", "assignee_id"],
    requiredKeys: ["title"],
  });
}
