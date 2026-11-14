import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

// PATCH /api/users/me on the Next origin (E31). Updates the caller's own name, email or both. The
// handler accepts only those two keys and requires neither, because Flask decides that at least one
// is sent and validates the values (P4). There is no GET: the profile page reads E30 on the server.
export async function PATCH(request: NextRequest) {
  return handlePrivateWrite(request, {
    route: "me",
    method: "PATCH",
    allowedKeys: ["name", "email"],
    requiredKeys: [],
  });
}
