"use client";

import { type FormEvent, type RefObject, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";
import type { AddState, CommentWrite } from "@/hooks/useCardComments";
import { validateCommentContent } from "@/lib/commentRules";

export interface CommentFormProps {
  /** True while a comment request runs. */
  pending: boolean;
  /** After an uncertain add the button stays disabled until a refresh succeeds (DD15). */
  addState: AddState;
  /** Lets the modal return focus to the field, for example after a delete. */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onAdd: (content: string) => Promise<CommentWrite>;
}

// The add form (Requirements 7.1, 7.2, 7.12). The draft stays on every failure, so a retry never
// needs retyping. A blank or over-long draft shows its message and sends no request.
export function CommentForm({ pending, addState, textareaRef, onAdd }: CommentFormProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const fieldRef = textareaRef ?? ownRef;
  const blocked = pending || addState === "checking" || addState === "refresh-failed";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const checked = validateCommentContent(draft);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(undefined);
    const result = await onAdd(checked.value);
    if (result.ok) {
      setDraft("");
      fieldRef.current?.focus(); // ready for the next comment (Requirement 7.1)
      return;
    }
    if (result.fields?.content) setError(result.fields.content);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
      <FormField
        id="add-comment"
        name="content"
        label="Add a comment"
        multiline
        rows={3}
        value={draft}
        error={error}
        textareaRef={fieldRef}
        onChange={setDraft}
      />
      <BaseButton type="submit" className="w-full sm:w-auto sm:self-start" loading={pending} disabled={blocked}>
        Add comment
      </BaseButton>
    </form>
  );
}
