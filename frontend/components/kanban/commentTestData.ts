import type { Comment } from "@/lib/types";

// Fixed data for the comment component tests. Not imported by application code.
export const ME = { id: "u-mia", name: "Mia", email: "mia@example.test" };
export const CREATED = "2026-11-13T09:00:00+00:00";

export function comment(id: string, over: Partial<Comment> = {}): Comment {
  return {
    id,
    card_id: "k1",
    author_id: ME.id,
    author_name: ME.name,
    content: `Comment ${id}`,
    created_at: CREATED,
    updated_at: CREATED,
    ...over,
  };
}
