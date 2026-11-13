import type { NextRequest } from "next/server";
import { handlePrivateRead, handlePrivateWrite } from "@/lib/server/privateRoute";

type CardCommentsRouteContext = { params: Promise<{ id: string }> };

// GET /api/cards/[id]/comments on the Next origin (E23). The card detail modal reads the comments
// here when it opens.
export async function GET(request: NextRequest, context: CardCommentsRouteContext) {
  const { id } = await context.params;
  return handlePrivateRead(request, { route: "cardComments", params: { cardId: id } });
}

// POST /api/cards/[id]/comments on the Next origin (E24). Adds a comment. The body is exactly
// `content`.
export async function POST(request: NextRequest, context: CardCommentsRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "cardComments",
    method: "POST",
    params: { cardId: id },
    allowedKeys: ["content"],
  });
}
