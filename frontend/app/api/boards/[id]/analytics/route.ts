import type { NextRequest } from "next/server";
import { handlePrivateRead } from "@/lib/server/privateRoute";

type AnalyticsRouteContext = { params: Promise<{ id: string }> };

// GET /api/boards/[id]/analytics on the Next origin (E29). The analytics panel reads here. The
// query string is forwarded exactly as received, so Flask returns the 400 for any parameter and
// this handler never reads it (A5, A6).
export async function GET(request: NextRequest, context: AnalyticsRouteContext) {
  const { id } = await context.params;
  return handlePrivateRead(request, {
    route: "boardAnalytics",
    params: { boardId: id },
    forwardQuery: true,
  });
}
