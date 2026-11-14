import type { NextRequest } from "next/server";
import { handlePrivateWrite } from "@/lib/server/privateRoute";

type NotificationReadContext = { params: Promise<{ id: string }> };

// PATCH /api/notifications/[id]/read on the Next origin (E28). Marks the caller's own notification
// read. There is no `allowedKeys`, so the handler reads no body and forwards none.
export async function PATCH(request: NextRequest, context: NotificationReadContext) {
  const { id } = await context.params;
  return handlePrivateWrite(request, {
    route: "notificationRead",
    method: "PATCH",
    params: { notificationId: id },
  });
}
