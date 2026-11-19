"use client";

import { type FormEvent, type RefObject, useId, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { BaseModal } from "@/components/shared/BaseModal";
import { CheckboxField } from "@/components/shared/CheckboxField";
import { FormField } from "@/components/shared/FormField";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import { ApiError } from "@/lib/errors";
import { validateColumnName } from "@/lib/kanbanRules";
import type { Column } from "@/lib/types";

export interface AddColumnFormProps {
  /** True when the board already has a Done column, so a second one is not offered. */
  hasDone: boolean;
  /** True while the board is busy. */
  disabled: boolean;
  onAdd: (name: string, isDone: boolean) => Promise<WriteResult<Column>>;
}

const DONE_TAKEN_HINT = "This board already has a Done column.";

// Admin control that adds a column at the end (E13, Requirements 7.1, 7.8). It shows an "Add
// column" button, which opens a modal with the form. The modal closes after a valid add. The Done
// checkbox is disabled, with a text reason, while a Done column exists. A failure keeps the modal
// open with the entered name. The form mounts only while the modal is open.
export function AddColumnForm({ hasDone, disabled, onAdd }: AddColumnFormProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <BaseButton icon="plus" disabled={disabled} onClick={() => setOpen(true)}>
        Add column
      </BaseButton>
      <BaseModal open={open} labelledBy={titleId} initialFocusRef={inputRef} onClose={() => setOpen(false)}>
        <AddColumnModalForm
          titleId={titleId}
          hasDone={hasDone}
          disabled={disabled}
          inputRef={inputRef}
          onAdd={onAdd}
          onClose={() => setOpen(false)}
        />
      </BaseModal>
    </>
  );
}

interface ModalFormProps extends AddColumnFormProps {
  titleId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}

function AddColumnModalForm({ titleId, hasDone, disabled, inputRef, onAdd, onClose }: ModalFormProps) {
  const [name, setName] = useState("");
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [doneError, setDoneError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending) return;
    setError(undefined);
    setDoneError(undefined);
    const checked = validateColumnName(name);
    if (!checked.ok) {
      setError(checked.error);
      inputRef.current?.focus();
      return;
    }
    setPending(true);
    const result = await onAdd(checked.value, isDone && !hasDone);
    setPending(false);
    if (result.ok) {
      onClose();
      return;
    }
    if (!result.handled && result.error instanceof ApiError) {
      if (result.error.code === "STATE_CONFLICT") setDoneError(result.error.message);
      else setError(result.error.fields?.name ?? result.error.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} aria-label="Add column" className="flex flex-col gap-4">
      <h2 id={titleId} className="break-words text-lg font-bold">
        Add column
      </h2>
      <FormField id="add-column-name" name="name" label="Column name" value={name} error={error} inputRef={inputRef} onChange={setName} />
      <CheckboxField
        id="add-column-done"
        name="is_done"
        label="Done column"
        checked={isDone && !hasDone}
        disabled={hasDone}
        hint={hasDone ? DONE_TAKEN_HINT : undefined}
        error={doneError}
        onChange={setIsDone}
      />
      <div className="modal-action mt-0 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <BaseButton variant="ghost" className="w-full sm:w-auto" disabled={pending} onClick={onClose}>
          Cancel
        </BaseButton>
        <BaseButton type="submit" className="w-full sm:w-auto" loading={pending} disabled={disabled}>
          Add column
        </BaseButton>
      </div>
    </form>
  );
}
