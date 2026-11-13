import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

type CardRouteContext = { params: Promise<{ id: string }> };

// PATCH /api/cards/[id] on the Next origin (E18). Edits title, description or assignee. Every key
// is optional here. Flask rejects an empty body.
export async function PATCH(request: NextRequest, context: CardRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "card",
    method: "PATCH",
    params: { cardId: id },
    allowedKeys: ["title", "description", "assignee_id"],
    requiredKeys: [],
  });
}

// DELETE /api/cards/[id] on the Next origin (E19). Soft-deletes a card.
export async function DELETE(request: NextRequest, context: CardRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "card",
    method: "DELETE",
    params: { cardId: id },
  });
}
