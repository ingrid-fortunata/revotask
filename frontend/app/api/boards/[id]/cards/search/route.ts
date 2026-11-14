import type { NextRequest } from "next/server";
import { handlePrivateRead } from "@/lib/server/privateRoute";

type CardSearchRouteContext = { params: Promise<{ id: string }> };

// GET /api/boards/[id]/cards/search on the Next origin (E22). The board search reads here. The
// query string is forwarded exactly as received (a repeated or unknown key, a blank `q`), so Flask
// returns the 400 and this handler never parses `q` (S3, S11).
export async function GET(request: NextRequest, context: CardSearchRouteContext) {
  const { id } = await context.params;
  return handlePrivateRead(request, {
    route: "boardCardSearch",
    params: { boardId: id },
    forwardQuery: true,
  });
}
