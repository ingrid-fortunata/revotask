import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

type CardRouteContext = { params: Promise<{ id: string }> };

// PATCH /api/cards/[id]/position on the Next origin (E20). All three keys are required, and
// before_card_id is explicit (a card ID or null), so a missing key is a 400 here.
export async function PATCH(request: NextRequest, context: CardRouteContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "cardPosition",
    method: "PATCH",
    params: { cardId: id },
    allowedKeys: ["column_id", "before_card_id", "expected_position_version"],
  });
}
