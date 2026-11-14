import type { NextRequest } from "next/server";
import { handlePrivateRead } from "@/lib/server/privateRoute";

// GET /api/notifications on the Next origin (E27). The page of the caller's notifications. The
// query string is forwarded exactly as received (a repeated or unknown key, a bad number), so Flask
// returns the 400 and this handler never parses `page` or `per_page`.
export async function GET(request: NextRequest) {
  return handlePrivateRead(request, { route: "notifications", forwardQuery: true });
}
