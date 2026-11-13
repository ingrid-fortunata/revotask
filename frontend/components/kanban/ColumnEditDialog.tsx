"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { BaseModal } from "@/components/shared/BaseModal";
import { CheckboxField } from "@/components/shared/CheckboxField";
import { FormField } from "@/components/shared/FormField";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import { ApiError } from "@/lib/errors";
import { validateColumnName } from "@/lib/kanbanRules";
import type { Column } from "@/lib/types";

export interface ColumnEditDialogProps {
  /** The column being edited. The dialog is open while this is set. */
  column: Column | null;
  /** Why the Done flag cannot change, as text, or null when it can. */
  doneLockedReason: string | null;
  onSave: (columnId: string, patch: { name?: string; is_done?: boolean }) => Promise<WriteResult<Column>>;
  onClose: () => void;
}

export function ColumnEditDialog({ column, doneLockedReason, onSave, onClose }: ColumnEditDialogProps) {
  const titleId = useId();
  return (
    <BaseModal open={column !== null} labelledBy={titleId} onClose={onClose}>
      {column ? (
        <ColumnEditForm key={column.id} titleId={titleId} column={column} doneLockedReason={doneLockedReason} onSave={onSave} onClose={onClose} />
      ) : null}
    </BaseModal>
  );
}

interface ColumnEditFormProps {
  titleId: string;
  column: Column;
  doneLockedReason: string | null;
  onSave: ColumnEditDialogProps["onSave"];
  onClose: () => void;
}

// One dialog for the name and the Done flag (L3, Requirements 7.2, 7.7). Only changed fields are
// sent. A failure keeps the dialog open with the entered values, the name error under the name and
// a column-rule message beside the Done toggle. The form mounts only while the dialog is open.
function ColumnEditForm({ titleId, column, doneLockedReason, onSave, onClose }: ColumnEditFormProps) {
  const [name, setName] = useState(column.name);
  const [isDone, setIsDone] = useState(column.is_done);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [doneError, setDoneError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setNameError(undefined);
    setDoneError(undefined);
    const checked = validateColumnName(name);
    if (!checked.ok) {
      setNameError(checked.error);
      nameRef.current?.focus();
      return;
    }
    const patch: { name?: string; is_done?: boolean } = {};
    if (checked.value !== column.name) patch.name = checked.value;
    if (isDone !== column.is_done) patch.is_done = isDone;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setPending(true);
    const result = await onSave(column.id, patch);
    setPending(false);
    if (result.ok) {
      onClose();
      return;
    }
    if (!result.handled && result.error instanceof ApiError) {
      if (result.error.code === "STATE_CONFLICT") setDoneError(result.error.message);
      else setNameError(result.error.fields?.name ?? result.error.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <h2 id={titleId} className="break-words text-lg font-bold">
        Edit column
      </h2>
      <FormField id="edit-column-name" name="name" label="Column name" value={name} error={nameError} inputRef={nameRef} onChange={setName} />
      <CheckboxField
        id="edit-column-done"
        name="is_done"
        label="Done column"
        checked={isDone}
        disabled={doneLockedReason !== null}
        hint={doneLockedReason ?? undefined}
        error={doneError}
        onChange={setIsDone}
      />
      <div className="modal-action mt-0 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <BaseButton variant="ghost" className="w-full sm:w-auto" disabled={pending} onClick={onClose}>
          Cancel
        </BaseButton>
        <BaseButton type="submit" className="w-full sm:w-auto" loading={pending}>
          Save column
        </BaseButton>
      </div>
    </form>
  );
}
