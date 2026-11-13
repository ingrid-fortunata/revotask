"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CardEditForm } from "@/components/kanban/CardEditForm";
import { CommentForm } from "@/components/kanban/CommentForm";
import { CommentList } from "@/components/kanban/CommentList";
import { BaseButton } from "@/components/shared/BaseButton";
import { BaseModal } from "@/components/shared/BaseModal";
import { useAuth } from "@/hooks/useAuth";
import { COMMENT_MESSAGES, type NotFoundResolution, useCardComments } from "@/hooks/useCardComments";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import type { Card, Membership } from "@/lib/types";

export interface CardDetailModalProps {
  /** The card being shown. The dialog is open while this is set. */
  card: Card | null;
  /** Active participants, for the assignee list. */
  members: readonly Membership[];
  onSave: (
    cardId: string,
    patch: { title?: string; description?: string | null; assignee_id?: string | null },
  ) => Promise<WriteResult<Card>>;
  onDelete: (cardId: string) => Promise<WriteResult<number>>;
  onClose: () => void;
  /** Refetches the board after a comment 404 and says whether the card or the board is gone (DD10). */
  resolveNotFound: () => Promise<NotFoundResolution>;
}

// The card detail modal (M10, Requirements 6.1 to 6.9, 7.x, 8.x). One dialog per card: the edit
// form first, then the comments. The body is keyed by card ID, so closing the dialog or opening
// another card drops the comment state and ignores any late response (DD11).
export function CardDetailModal({ card, members, onSave, onDelete, onClose, resolveNotFound }: CardDetailModalProps) {
  const titleId = useId();
  return (
    <BaseModal open={card !== null} labelledBy={titleId} onClose={onClose} wide>
      {card ? (
        <CardDetailBody
          key={card.id}
          titleId={titleId}
          card={card}
          members={members}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onClose}
          resolveNotFound={resolveNotFound}
        />
      ) : null}
    </BaseModal>
  );
}

interface CardDetailBodyProps extends Omit<CardDetailModalProps, "card"> {
  titleId: string;
  card: Card;
}

function CardDetailBody({ titleId, card, members, onSave, onDelete, onClose, resolveNotFound }: CardDetailBodyProps) {
  const { user } = useAuth();
  const headingId = useId();
  const comments = useCardComments({ cardId: card.id, resolveNotFound, onCardGone: onClose });
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  // After a delete the focused control is gone, so focus goes to the comment field (Requirement 7.6).
  useEffect(() => {
    if (focusRequest > 0) fieldRef.current?.focus();
  }, [focusRequest]);

  async function handleDelete(commentId: string) {
    const result = await comments.remove(commentId);
    if (result.ok) setFocusRequest((count) => count + 1);
    return result;
  }

  const { status, addState, notice } = comments;
  const count = status === "ready" ? ` (${comments.comments.length})` : "";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="break-words text-lg font-bold">
          Card details
        </h2>
        <BaseButton variant="ghost" aria-label="Close card details" onClick={onClose}>
          Close
        </BaseButton>
      </div>

      <CardEditForm card={card} members={members} lockCard={comments.pending} onSave={onSave} onDelete={onDelete} onClose={onClose} />

      <section aria-labelledby={headingId} aria-busy={status === "loading"} className="flex min-w-0 flex-col gap-3 border-t border-base-300 pt-4">
        <h3 id={headingId} className="text-lg font-semibold">
          Comments{count}
        </h3>
        <p role="status" aria-live="polite" className="sr-only">
          {comments.announcement}
        </p>

        {status === "loading" ? <p role="status">Loading comments…</p> : null}

        {status === "error" ? (
          <div role="alert" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="break-words">{COMMENT_MESSAGES.loadFailed}</p>
            <BaseButton className="w-full sm:w-auto" disabled={comments.pending} onClick={() => void comments.reload()}>
              Retry
            </BaseButton>
          </div>
        ) : null}

        {status === "ready" ? (
          <CommentList
            comments={comments.comments}
            currentUserId={user.id}
            disabled={comments.pending}
            onEdit={comments.edit}
            onDelete={handleDelete}
          />
        ) : null}

        {notice ? (
          <div role="alert" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="break-words">{notice.text}</p>
            {notice.retry ? (
              <BaseButton className="w-full sm:w-auto" disabled={comments.pending} onClick={() => void comments.reload()}>
                Retry
              </BaseButton>
            ) : null}
          </div>
        ) : null}

        {addState === "checking" ? <p role="status">{COMMENT_MESSAGES.checking}</p> : null}
        {addState === "review" ? <p role="alert">{COMMENT_MESSAGES.review}</p> : null}
        {addState === "refresh-failed" ? (
          <div role="alert" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="break-words">{COMMENT_MESSAGES.refreshNeeded}</p>
            <BaseButton className="w-full sm:w-auto" disabled={comments.pending} onClick={() => void comments.reload()}>
              Refresh comments
            </BaseButton>
          </div>
        ) : null}

        {status !== "loading" ? <CommentForm pending={comments.pending} addState={addState} textareaRef={fieldRef} onAdd={comments.add} /> : null}
      </section>
    </div>
  );
}
