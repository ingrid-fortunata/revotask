import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

type BoardRouteContext = { params: Promise<{ id: string }> };

// PATCH /api/boards/[id]/columns/reorder on the Next origin (E16). All three keys are required,
// and before_column_id is explicit (a column ID or null), so a missing key is a 400 here.
export async function PATCH(request: NextRequest, context: BoardRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "boardColumnsReorder",
    method: "PATCH",
    params: { boardId: id },
    allowedKeys: ["column_id", "before_column_id", "expected_position_version"],
  });
}
