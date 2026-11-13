"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiRequest } from "@/lib/apiClient";
import { parseBoardSummary } from "@/lib/boards";
import { validateBoardName } from "@/lib/boardRules";
import type { BoardSummary } from "@/lib/types";

export interface CreateBoardFormProps {
  /** Called with the server's board before navigation, so the dashboard list can show it. */
  onCreated: (board: BoardSummary) => void;
}

// Browser write for E06 through the same-origin Route Handler (DD13). The token stays in the
// HttpOnly cookie. A 400 keeps the typed name and shows the field message (Requirement 1.8).
// Stacked below 640 px with a full-width submit, in a row from sm up (Mobile design table).
export function CreateBoardForm({ onCreated }: CreateBoardFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const { handleError } = useErrorHandler();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    setFormError(null);
    setFieldError(undefined);

    const checked = validateBoardName(name);
    if (!checked.ok) {
      setFieldError(checked.error);
      return;
    }

    pendingRef.current = true;
    setPending(true);
    try {
      const data = await apiRequest<unknown>("POST", "/api/boards", { name: checked.name });
      const board = parseBoardSummary(data);
      onCreated(board);
      router.push(`/boards/${board.id}`);
    } catch (error) {
      handleError(error, {
        onFields: (fields) => setFieldError(fields.name ?? undefined),
        onFormError: setFormError,
      });
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="flex flex-col gap-2 sm:flex-row sm:items-end lg:flex-col lg:items-stretch">
      {formError ? (
        <div role="alert" className="alert alert-error w-full break-words">
          {formError}
        </div>
      ) : null}
      <div className="min-w-0 sm:flex-1">
        <FormField
          id="create-board-name"
          name="name"
          label="Board name"
          value={name}
          error={fieldError}
          onChange={setName}
        />
      </div>
      <BaseButton type="submit" loading={pending} className="w-full sm:w-auto lg:w-full">
        {pending ? "Creating…" : "Create board"}
      </BaseButton>
    </form>
  );
}
