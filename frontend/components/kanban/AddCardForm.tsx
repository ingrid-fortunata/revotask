"use client";

import { type FormEvent, type RefObject, useId, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { BaseModal } from "@/components/shared/BaseModal";
import { FormField } from "@/components/shared/FormField";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import { ApiError } from "@/lib/errors";
import { validateCardTitle } from "@/lib/kanbanRules";
import type { Card } from "@/lib/types";

export interface AddCardFormProps {
  columnId: string;
  columnName: string;
  /** True while the board is busy. */
  disabled: boolean;
  onAdd: (title: string) => Promise<WriteResult<Card>>;
}

// Adds a card at the end of one column (E17, Requirements 8.1, 8.2). The lane shows only an "Add
// card" button. It opens a modal with the title field, and the modal closes after a valid add. A
// failure keeps the modal open, keeps the title and shows the message under the field. The form
// mounts only while the modal is open, so each open starts empty. The names include the column,
// because every lane has one.
export function AddCardForm({ columnId, columnName, disabled, onAdd }: AddCardFormProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <BaseButton
        variant="ghost"
        icon="plus"
        className="w-full justify-start text-base-content/70"
        aria-label={`Add card to ${columnName}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Add card
      </BaseButton>
      <BaseModal open={open} labelledBy={titleId} initialFocusRef={inputRef} onClose={() => setOpen(false)}>
        <AddCardModalForm
          columnId={columnId}
          columnName={columnName}
          titleId={titleId}
          disabled={disabled}
          inputRef={inputRef}
          onAdd={onAdd}
          onClose={() => setOpen(false)}
        />
      </BaseModal>
    </>
  );
}

interface ModalFormProps extends AddCardFormProps {
  titleId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}

function AddCardModalForm({ columnId, columnName, titleId, disabled, inputRef, onAdd, onClose }: ModalFormProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending) return;
    setError(undefined);
    const checked = validateCardTitle(title);
    if (!checked.ok) {
      setError(checked.error);
      inputRef.current?.focus();
      return;
    }
    setPending(true);
    const result = await onAdd(checked.value);
    setPending(false);
    if (result.ok) {
      onClose();
      return;
    }
    if (!result.handled && result.error instanceof ApiError) {
      setError(result.error.fields?.title ?? result.error.message);
      inputRef.current?.focus();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} aria-label={`Add card to ${columnName}`} className="flex flex-col gap-4">
      <h2 id={titleId} className="break-words text-lg font-bold">
        Add card to {columnName}
      </h2>
      <FormField id={`add-card-${columnId}`} name="title" label="New card" value={title} error={error} inputRef={inputRef} onChange={setTitle} />
      <div className="modal-action mt-0 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <BaseButton variant="ghost" className="w-full sm:w-auto" disabled={pending} onClick={onClose}>
          Cancel
        </BaseButton>
        <BaseButton type="submit" className="w-full sm:w-auto" loading={pending} disabled={disabled}>
          Add card
        </BaseButton>
      </div>
    </form>
  );
}
