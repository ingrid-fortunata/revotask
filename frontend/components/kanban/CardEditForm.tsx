"use client";

import { type FormEvent, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";
import { SelectField } from "@/components/shared/SelectField";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import { ApiError } from "@/lib/errors";
import { validateCardTitle, validateDescription } from "@/lib/kanbanRules";
import type { Card, Membership } from "@/lib/types";

export interface CardEditFormProps {
  /** The card being edited. */
  card: Card;
  /** Active participants, for the assignee list. */
  members: readonly Membership[];
  /** True while a comment write runs: Save and Delete wait for it (Requirement 7.9). */
  lockCard?: boolean;
  onSave: (
    cardId: string,
    patch: { title?: string; description?: string | null; assignee_id?: string | null },
  ) => Promise<WriteResult<Card>>;
  onDelete: (cardId: string) => Promise<WriteResult<number>>;
  onClose: () => void;
}

type Fields = { title?: string; description?: string; assignee_id?: string };

const NONE = "";

// Edit, assign and delete one card (K5, kanban Requirements 8.3 to 8.5). It is the form half of
// the card detail modal. Only changed fields are sent, and a 400 keeps the form with the entered
// values and the message under the field. Delete asks for confirmation and names the card.
export function CardEditForm({ card, members, lockCard = false, onSave, onDelete, onClose }: CardEditFormProps) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [assignee, setAssignee] = useState(card.assignee_id ?? NONE);
  const [errors, setErrors] = useState<Fields>({});
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const options = [
    { value: NONE, label: "Unassigned" },
    ...members.map((member) => ({ value: member.user_id, label: member.name })),
  ];
  // A card can still name a user who is no longer a participant until the board refetches.
  if (card.assignee_id && !options.some((option) => option.value === card.assignee_id)) {
    options.push({ value: card.assignee_id, label: card.assignee_name ?? "Former participant" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || lockCard) return;
    setErrors({});
    const checkedTitle = validateCardTitle(title);
    const checkedDescription = validateDescription(description);
    if (!checkedTitle.ok || !checkedDescription.ok) {
      setErrors({
        title: checkedTitle.ok ? undefined : checkedTitle.error,
        description: checkedDescription.ok ? undefined : checkedDescription.error,
      });
      if (!checkedTitle.ok) titleRef.current?.focus();
      return;
    }
    const patch: { title?: string; description?: string | null; assignee_id?: string | null } = {};
    if (checkedTitle.value !== card.title) patch.title = checkedTitle.value;
    if (checkedDescription.value !== card.description) patch.description = checkedDescription.value;
    if (assignee !== (card.assignee_id ?? NONE)) patch.assignee_id = assignee === NONE ? null : assignee;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setPending(true);
    const result = await onSave(card.id, patch);
    setPending(false);
    if (result.ok) {
      onClose();
      return;
    }
    if (!result.handled && result.error instanceof ApiError) {
      const fields = result.error.fields ?? {};
      setErrors({
        title: fields.title,
        description: fields.description,
        assignee_id: fields.assignee_id ?? (Object.keys(fields).length === 0 ? result.error.message : undefined),
      });
    }
  }

  async function handleConfirmDelete() {
    if (deletePending || lockCard) return;
    setDeletePending(true);
    const result = await onDelete(card.id);
    setDeletePending(false);
    setConfirmOpen(false);
    if (result.ok) onClose();
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate aria-label="Edit card" aria-busy={pending} className="flex flex-col gap-4">
        <FormField id="edit-card-title" name="title" label="Title" value={title} error={errors.title} inputRef={titleRef} onChange={setTitle} />
        <FormField id="edit-card-description" name="description" label="Description" multiline value={description} error={errors.description} onChange={setDescription} />
        <SelectField id="edit-card-assignee" name="assignee_id" label="Assignee" value={assignee} options={options} error={errors.assignee_id} onChange={setAssignee} />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <BaseButton variant="ghost" icon="trash" className="w-full text-error sm:w-auto" disabled={pending || lockCard} onClick={() => setConfirmOpen(true)}>
            Delete card
          </BaseButton>
          <div className="flex flex-col gap-2 sm:flex-row">
            <BaseButton variant="ghost" className="w-full sm:w-auto" disabled={pending} onClick={onClose}>
              Cancel
            </BaseButton>
            <BaseButton type="submit" icon="check" className="w-full sm:w-auto" loading={pending} disabled={lockCard}>
              Save card
            </BaseButton>
          </div>
        </div>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete card?"
        message={`Delete "${card.title}"? This cannot be undone.`}
        confirmLabel="Delete card"
        pending={deletePending || lockCard}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
