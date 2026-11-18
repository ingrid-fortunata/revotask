"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { SprintFields } from "@/components/boards/SprintFields";
import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiRequest } from "@/lib/apiClient";
import { validateBoardName, validateSprint } from "@/lib/boardRules";
import { BOARD_ACCESS_MESSAGE, isBoardAccessError, isForbiddenError } from "@/lib/boardErrors";
import { parseBoardSummary } from "@/lib/boards";
import { notifyError } from "@/lib/toast";

export interface RenameBoardFormProps {
  boardId: string;
  currentName: string;
  /** The sprint now on the board, or both `null`. The date fields start from it. */
  currentSprint: { sprint_start: string | null; sprint_end: string | null };
  /** Called with the server's name and sprint after E08 succeeds. */
  onSaved: (board: { name: string; sprint_start: string | null; sprint_end: string | null }) => void;
  /** Closes the form on Cancel, after a 403, and after a successful save. */
  onClose: () => void;
}

// Admin edit of the name and the sprint through the same-origin Route Handler (E08, DD13). The name
// is always sent. The sprint pair is sent when both dates are filled, as two nulls when both are
// empty and the board had a sprint (it clears it), and not at all otherwise (design DS10). A 400
// keeps the typed values and focuses the first field with an error (design "Error Handling"). A
// board-access 404 leaves the page. Stacked below 640 px with full-width buttons (FE-S4).
export function RenameBoardForm({
  boardId,
  currentName,
  currentSprint,
  onSaved,
  onClose,
}: RenameBoardFormProps) {
  const router = useRouter();
  const { handleError } = useErrorHandler();
  const [name, setName] = useState(currentName);
  const [start, setStart] = useState(currentSprint.sprint_start ?? "");
  const [end, setEnd] = useState(currentSprint.sprint_end ?? "");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [sprintErrors, setSprintErrors] = useState<{ sprint_start?: string; sprint_end?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const hadSprint = currentSprint.sprint_start !== null;

  function focusFirstError(name?: string, errors: { sprint_start?: string; sprint_end?: string } = {}) {
    if (name) inputRef.current?.focus();
    else if (errors.sprint_start) startRef.current?.focus();
    else if (errors.sprint_end) endRef.current?.focus();
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    setFormError(null);
    setFieldError(undefined);
    setSprintErrors({});

    const checked = validateBoardName(name);
    const sprint = validateSprint(start || null, end || null);
    if (!checked.ok || !sprint.ok) {
      const nameError = checked.ok ? undefined : checked.error;
      const errors = sprint.ok ? {} : sprint.errors;
      setFieldError(nameError);
      setSprintErrors(errors);
      focusFirstError(nameError, errors);
      return;
    }
    // Two nulls clear an existing sprint. With none to clear, no sprint key is sent.
    const sprintBody = sprint.sprint ?? (hadSprint ? { sprint_start: null, sprint_end: null } : {});

    pendingRef.current = true;
    setPending(true);
    try {
      const data = await apiRequest<unknown>("PATCH", `/api/boards/${boardId}`, {
        name: checked.name,
        ...sprintBody,
      });
      const saved = parseBoardSummary(data);
      onSaved({ name: saved.name, sprint_start: saved.sprint_start, sprint_end: saved.sprint_end });
    } catch (error) {
      pendingRef.current = false;
      setPending(false);
      if (isBoardAccessError(error)) {
        notifyError(BOARD_ACCESS_MESSAGE);
        router.push("/");
        return;
      }
      if (isForbiddenError(error)) {
        handleError(error);
        onClose();
        router.refresh();
        return;
      }
      handleError(error, {
        onFields: (fields) => {
          const errors = { sprint_start: fields.sprint_start, sprint_end: fields.sprint_end };
          setSprintErrors(errors);
          // A field the form does not show (an unknown key) still reaches the name message.
          const nameError =
            fields.name ?? (errors.sprint_start || errors.sprint_end ? undefined : Object.values(fields)[0]);
          setFieldError(nameError);
          focusFirstError(nameError, errors);
        },
        onFormError: setFormError,
      });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={pending}
      aria-label="Edit board"
      className="flex flex-col gap-3"
    >
      {formError ? (
        <div role="alert" className="alert alert-error w-full break-words">
          {formError}
        </div>
      ) : null}
      <div className="min-w-0">
        <FormField
          id="rename-board-name"
          name="name"
          label="Board name"
          value={name}
          error={fieldError}
          inputRef={inputRef}
          onChange={setName}
        />
      </div>
      <SprintFields
        idPrefix="edit-board"
        start={start}
        end={end}
        startError={sprintErrors.sprint_start}
        endError={sprintErrors.sprint_end}
        onStartChange={setStart}
        onEndChange={setEnd}
        startRef={startRef}
        endRef={endRef}
        onClear={() => {
          setStart("");
          setEnd("");
          setSprintErrors({});
        }}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <BaseButton type="submit" loading={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : "Save changes"}
        </BaseButton>
        <BaseButton variant="ghost" className="w-full sm:w-auto" disabled={pending} onClick={onClose}>
          Cancel
        </BaseButton>
      </div>
    </form>
  );
}
