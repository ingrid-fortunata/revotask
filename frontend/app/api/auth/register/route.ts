import type { NextRequest } from "next/server";
import {
  callFlask,
  forbiddenOrigin,
  loadServerEnv,
  newRequestId,
  passThrough,
  readJsonObject,
} from "@/lib/server/bff";
import { checkOrigin } from "@/lib/server/origin";

// POST /api/auth/register on the Next origin (E02). Registers an account and sets no cookie.
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const env = loadServerEnv(requestId);
  if (!env.ok) return env.response;
  if (!checkOrigin(request, env.value.appOrigin)) return forbiddenOrigin(requestId);

  const body = await readJsonObject(request, ["name", "email", "password"], requestId);
  if (!body.ok) return body.response;

  const upstream = await callFlask({ route: "register", method: "POST", body: body.body }, requestId);
  if (!upstream.ok) return upstream.response;
  return passThrough(upstream.value, requestId);
}
