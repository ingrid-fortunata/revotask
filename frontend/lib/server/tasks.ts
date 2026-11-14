import "server-only";

import { apiErrorFromEnvelope, malformedApiError } from "../errors";
import { parseTaskList } from "../tasks";
import type { TaskItem } from "../types";
import { isRecord } from "./bff";
import { fetchPrivate } from "./session";

// Server Component read for /my-tasks (E21; Requirement 4.1, 8.2). A missing cookie or a Flask 401
// redirects to /login inside fetchPrivate. Any other failure throws ApiError to the error
// boundary, and no partial list is returned. The query is fixed here, never taken from the caller.
export async function getMyTasks(): Promise<TaskItem[]> {
  const result = await fetchPrivate("myTasks", { method: "GET", search: "?assignee=me" });
  if (result.status !== 200) {
    throw apiErrorFromEnvelope(result.status, result.body, result.retryAfter);
  }
  if (!isRecord(result.body) || !("data" in result.body)) {
    throw malformedApiError(result.status);
  }
  return parseTaskList(result.body.data);
}
