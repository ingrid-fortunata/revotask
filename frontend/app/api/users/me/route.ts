import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

// PATCH /api/users/me on the Next origin (E31). Updates the caller's own name, the password pair
// (`current_password` and `new_password`) or both. The email is the fixed login key, so `email` is
// an unknown key here as on Flask (P12). The handler requires no key, because Flask decides that at
// least one is sent and validates the values (P4). There is no GET: the profile page reads E30 on
// the server. A body is never logged or echoed by the shared helper.
export async function PATCH(request: NextRequest) {
  return handlePrivateWrite(request, {
    route: "me",
    method: "PATCH",
    allowedKeys: ["name", "current_password", "new_password"],
    requiredKeys: [],
  });
}
