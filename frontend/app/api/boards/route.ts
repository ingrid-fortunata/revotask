import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

// POST /api/boards on the Next origin (E06). Creates a board and returns the created board
// summary. The access token stays in the HttpOnly session cookie (Requirement 7.4, DD13).
export async function POST(request: NextRequest) {
  return handlePrivateWrite(request, {
    route: "boards",
    method: "POST",
    allowedKeys: ["name"],
  });
}
