"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";
import type { CommentWrite } from "@/hooks/useCardComments";
import { validateCommentContent } from "@/lib/commentRules";
import { formatCommentDay, formatCommentTime, isEdited } from "@/lib/comments";
import type { Comment } from "@/lib/types";

export interface CommentItemProps {
  comment: Comment;
  /** Edit and Delete show only when this is the comment's author (M4). */
  isAuthor: boolean;
  /** True while a comment request runs. */
  disabled: boolean;
  onEdit: (commentId: string, content: string) => Promise<CommentWrite>;
  onDelete: (commentId: string) => Promise<CommentWrite>;
}

// One comment (Requirements 6.4, 7.4 to 7.6, 8.6, design DD13, DD14). The content is a text node
// in a pre-wrapped element, so markup shows as literal text and line breaks stay. The item holds
// only the editor draft and the delete confirmation. Data and requests stay with the modal.
export function CommentItem({ comment, isAuthor, disabled, onEdit, onDelete }: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  const day = formatCommentDay(comment.created_at);

  // Focus follows the editor: into the field when it opens, back to Edit when it closes.
  useEffect(() => {
    if (editing) fieldRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  function openEditor() {
    setDraft(comment.content);
    setError(undefined);
    setEditing(true);
  }

  function closeEditor() {
    returnFocus.current = true;
    setEditing(false);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || disabled) return;
    const checked = validateCommentContent(draft);
    if (!checked.ok) {
      setError(checked.error);
      fieldRef.current?.focus();
      return;
    }
    if (checked.value === comment.content) {
      closeEditor(); // unchanged text sends no request (Requirement 7.5)
      return;
    }
    setError(undefined);
    setSaving(true);
    const result = await onEdit(comment.id, checked.value);
    setSaving(false);
    if (result.ok) {
      closeEditor();
      return;
    }
    if (result.fields?.content) setError(result.fields.content);
  }

  async function handleConfirmDelete() {
    if (deleting) return;
    setDeleting(true);
    await onDelete(comment.id);
    setDeleting(false);
    setConfirmOpen(false);
  }

  return (
    <li className="flex min-w-0 flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="break-words font-semibold">{comment.author_name}</span>
        <time dateTime={comment.created_at} className="text-sm text-base-content/70">
          {formatCommentTime(comment.created_at)}
        </time>
        {isEdited(comment) ? <span className="text-sm text-base-content/70">Edited</span> : null}
      </div>

      {editing ? (
        <form onSubmit={handleSave} noValidate aria-label={`Edit your comment from ${day}`} className="flex flex-col gap-2">
          <FormField
            id={`edit-comment-${comment.id}`}
            name="content"
            label="Edit your comment"
            multiline
            rows={3}
            value={draft}
            error={error}
            textareaRef={fieldRef}
            onChange={setDraft}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <BaseButton type="submit" className="w-full sm:w-auto" loading={saving} disabled={disabled}>
              Save comment
            </BaseButton>
            <BaseButton variant="ghost" className="w-full sm:w-auto" disabled={saving} onClick={closeEditor}>
              Cancel
            </BaseButton>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap break-words">{comment.content}</p>
      )}

      {isAuthor && !editing ? (
        <div className="flex flex-wrap gap-2">
          <BaseButton
            ref={editButtonRef}
            variant="ghost"
            className="border-base-300"
            aria-label={`Edit your comment from ${day}`}
            disabled={disabled}
            onClick={openEditor}
          >
            Edit
          </BaseButton>
          <BaseButton
            variant="ghost"
            className="border-base-300 text-error"
            aria-label={`Delete your comment from ${day}`}
            disabled={disabled}
            onClick={() => setConfirmOpen(true)}
          >
            Delete
          </BaseButton>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Delete comment?"
        message={`Delete your comment from ${day}? This cannot be undone.`}
        confirmLabel="Delete comment"
        pending={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </li>
  );
}
