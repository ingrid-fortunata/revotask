"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type Ref, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { SprintFields } from "@/components/boards/SprintFields";
import { FormField } from "@/components/shared/FormField";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiRequest } from "@/lib/apiClient";
import { parseBoardSummary } from "@/lib/boards";
import { validateBoardName, validateSprint } from "@/lib/boardRules";
import type { BoardSummary } from "@/lib/types";

export interface CreateBoardFormProps {
  /** Called with the server's board before navigation, so the dashboard list can show it. */
  onCreated: (board: BoardSummary) => void;
  /** Lets the modal that holds the form focus the name field on open. */
  inputRef?: Ref<HTMLInputElement>;
}

// Browser write for E06 through the same-origin Route Handler (DD13). The token stays in the
// HttpOnly cookie. A 400 keeps the typed name and dates and shows the field message (Requirements
// 1.8, 8.11). The optional sprint pair is sent only when both dates are filled (DS11). The form is
// stacked at every width: name, the date grid, then a full-width submit (Mobile design table).
export function CreateBoardForm({ onCreated, inputRef }: CreateBoardFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [sprintErrors, setSprintErrors] = useState<{ sprint_start?: string; sprint_end?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const { handleError } = useErrorHandler();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    setFormError(null);
    setFieldError(undefined);
    setSprintErrors({});

    // Both checks run before any request, so the user sees every problem at once.
    const checked = validateBoardName(name);
    const sprint = validateSprint(start || null, end || null);
    if (!checked.ok || !sprint.ok) {
      if (!checked.ok) setFieldError(checked.error);
      if (!sprint.ok) setSprintErrors(sprint.errors);
      return;
    }

    pendingRef.current = true;
    setPending(true);
    try {
      const data = await apiRequest<unknown>("POST", "/api/boards", {
        name: checked.name,
        ...(sprint.sprint ?? {}),
      });
      const board = parseBoardSummary(data);
      onCreated(board);
      router.push(`/boards/${board.id}`);
    } catch (error) {
      handleError(error, {
        onFields: (fields) => {
          setFieldError(fields.name ?? undefined);
          setSprintErrors({ sprint_start: fields.sprint_start, sprint_end: fields.sprint_end });
        },
        onFormError: setFormError,
      });
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="flex flex-col gap-3">
      {formError ? (
        <div role="alert" className="alert alert-error w-full break-words">
          {formError}
        </div>
      ) : null}
      <div className="min-w-0">
        <FormField
          id="create-board-name"
          name="name"
          label="Board name"
          value={name}
          error={fieldError}
          inputRef={inputRef}
          onChange={setName}
        />
      </div>
      <SprintFields
        idPrefix="create-board"
        start={start}
        end={end}
        startError={sprintErrors.sprint_start}
        endError={sprintErrors.sprint_end}
        onStartChange={setStart}
        onEndChange={setEnd}
      />
      <BaseButton type="submit" loading={pending} className="w-full">
        {pending ? "Creating…" : "Create board"}
      </BaseButton>
    </form>
  );
}
