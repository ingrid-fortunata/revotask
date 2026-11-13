import { CommentItem } from "@/components/kanban/CommentItem";
import type { CommentWrite } from "@/hooks/useCardComments";
import type { Comment } from "@/lib/types";

export interface CommentListProps {
  comments: readonly Comment[];
  /** The signed-in user's ID. Only their own comments get Edit and Delete. */
  currentUserId: string;
  /** True while a comment request runs. */
  disabled: boolean;
  onEdit: (commentId: string, content: string) => Promise<CommentWrite>;
  onDelete: (commentId: string) => Promise<CommentWrite>;
}

// Props-only (FE-C2): no fetching and no state of its own. It shows the empty text or the list in
// the order it was given. The heading with the count belongs to the modal's section.
export function CommentList({ comments, currentUserId, disabled, onEdit, onDelete }: CommentListProps) {
  if (comments.length === 0) {
    return <p className="text-base-content/70">No comments yet.</p>;
  }
  return (
    <ul className="divide-y divide-base-300">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          isAuthor={comment.author_id === currentUserId}
          disabled={disabled}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
