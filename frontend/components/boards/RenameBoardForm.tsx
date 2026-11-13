"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiRequest } from "@/lib/apiClient";
import { validateBoardName } from "@/lib/boardRules";
import { BOARD_ACCESS_MESSAGE, isBoardAccessError, isForbiddenError } from "@/lib/boardErrors";
import { parseBoardSummary } from "@/lib/boards";
import { notifyError } from "@/lib/toast";

export interface RenameBoardFormProps {
  boardId: string;
  currentName: string;
  /** Called with the server's name after E08 succeeds. */
  onRenamed: (name: string) => void;
  /** Closes the form on Cancel, after a 403, and after a successful rename. */
  onClose: () => void;
}

// Admin rename through the same-origin Route Handler (E08, DD13). A 400 keeps the typed value and
// focuses the field (design "Error Handling"). A board-access 404 leaves the page. Stacked below
// 640 px with a full-width submit, in a row from sm up (Mobile design table, FE-S4).
export function RenameBoardForm({ boardId, currentName, onRenamed, onClose }: RenameBoardFormProps) {
  const router = useRouter();
  const { handleError } = useErrorHandler();
  const [name, setName] = useState(currentName);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    setFormError(null);
    setFieldError(undefined);

    const checked = validateBoardName(name);
    if (!checked.ok) {
      setFieldError(checked.error);
      inputRef.current?.focus();
      return;
    }

    pendingRef.current = true;
    setPending(true);
    try {
      const data = await apiRequest<unknown>("PATCH", `/api/boards/${boardId}`, { name: checked.name });
      onRenamed(parseBoardSummary(data).name);
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
          setFieldError(fields.name ?? Object.values(fields)[0]);
          inputRef.current?.focus();
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
      aria-label="Rename board"
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      {formError ? (
        <div role="alert" className="alert alert-error w-full break-words">
          {formError}
        </div>
      ) : null}
      <div className="min-w-0 sm:flex-1">
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
      <BaseButton type="submit" loading={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : "Save name"}
      </BaseButton>
      <BaseButton variant="ghost" className="w-full sm:w-auto" disabled={pending} onClick={onClose}>
        Cancel
      </BaseButton>
    </form>
  );
}
