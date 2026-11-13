import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

type ColumnRouteContext = { params: Promise<{ id: string }> };

// PATCH /api/columns/[id] on the Next origin (E14). Renames a column or changes its Done flag.
// Both keys are optional here. Flask rejects an empty body.
export async function PATCH(request: NextRequest, context: ColumnRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "column",
    method: "PATCH",
    params: { columnId: id },
    allowedKeys: ["name", "is_done"],
    requiredKeys: [],
  });
}

// DELETE /api/columns/[id] on the Next origin (E15). Soft-deletes an empty column.
export async function DELETE(request: NextRequest, context: ColumnRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "column",
    method: "DELETE",
    params: { columnId: id },
  });
}
