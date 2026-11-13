import "server-only";

import { notFound } from "next/navigation";
import {
  parseBoardDetail,
  parseBoardSummaryList,
  parseMembershipList,
} from "../boards";
import { apiErrorFromEnvelope, malformedApiError } from "../errors";
import type { BoardDetail, BoardSummary, Membership } from "../types";
import { isRecord } from "./bff";
import type { FlaskParams, FlaskRoute } from "./flask";
import { isUuid } from "./privateRoute";
import { fetchPrivate } from "./session";

// Server Component reads for the dashboard and board pages (R7, DD11). Each helper returns the
// parsed, allowlisted payload. A missing cookie or a Flask 401 redirects to /login inside
// fetchPrivate. A 404 or a non-UUID board ID calls notFound(), which renders the not-found state.

// Returns the `data` value of a 200 reply. A 404 calls notFound() when `notFoundOn404` is set,
// which is the case for every board-scoped read. Other failures throw an ApiError.
async function readData(
  route: FlaskRoute,
  options: { params?: FlaskParams; notFoundOn404: boolean },
): Promise<unknown> {
  const result = await fetchPrivate(route, {
    method: "GET",
    params: options.params,
  });
  if (result.status === 404 && options.notFoundOn404) notFound();
  if (result.status !== 200) {
    throw apiErrorFromEnvelope(result.status, result.body, result.retryAfter);
  }
  if (!isRecord(result.body) || !("data" in result.body)) {
    throw malformedApiError(result.status);
  }
  return result.body.data;
}

export async function getBoards(): Promise<BoardSummary[]> {
  const data = await readData("boards", { notFoundOn404: false });
  return parseBoardSummaryList(data);
}

export async function getBoard(id: string): Promise<BoardDetail> {
  if (!isUuid(id)) notFound();
  const data = await readData("board", {
    params: { boardId: id },
    notFoundOn404: true,
  });
  return parseBoardDetail(data);
}

export async function getBoardMembers(id: string): Promise<Membership[]> {
  if (!isUuid(id)) notFound();
  const data = await readData("boardMembers", {
    params: { boardId: id },
    notFoundOn404: true,
  });
  return parseMembershipList(data);
}
