"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiRequest } from "@/lib/apiClient";
import { BOARD_ACCESS_MESSAGE, isBoardAccessError, isForbiddenError } from "@/lib/boardErrors";
import { validateMemberEmail } from "@/lib/boardRules";
import { parseMembership } from "@/lib/boards";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import type { Membership } from "@/lib/types";

export interface AddMemberFormProps {
  boardId: string;
  /** Called with the server's membership after E11 returns 201. */
  onAdded: (membership: Membership) => void;
}

// Admin add-by-email through the same-origin Route Handler (E11, DD13, FE-C1). Only 400, 409 and
// 404 USER_NOT_FOUND show under the email field, and the typed email stays (Requirement 4.12). Any
// other 404 means the board is gone or access was removed, so the page leaves (Requirement 4.14).
// Stacked below 640 px with a full-width submit, in a row from sm up (FE-S4, FE-S5).
export function AddMemberForm({ boardId, onAdded }: AddMemberFormProps) {
  const router = useRouter();
  const { handleError } = useErrorHandler();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function showEmailError(message: string) {
    setFieldError(message);
    inputRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    setFieldError(undefined);
    const checked = validateMemberEmail(email);
    if (!checked.ok) {
      showEmailError(checked.error);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      const data = await apiRequest<unknown>("POST", `/api/boards/${boardId}/members`, {
        email: checked.email,
      });
      onAdded(parseMembership(data));
      setEmail("");
      router.refresh();
    } catch (error) {
      if (isBoardAccessError(error)) {
        notifyError(BOARD_ACCESS_MESSAGE);
        router.push("/");
        return;
      }
      if (error instanceof ApiError && isEmailFieldError(error)) {
        showEmailError(error.fields?.email ?? error.message);
        return;
      }
      handleError(error);
      if (isForbiddenError(error)) router.refresh();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={pending}
      aria-label="Add member"
      className="flex flex-col gap-2 sm:flex-row sm:items-end lg:flex-col lg:items-stretch"
    >
      <div className="min-w-0 sm:flex-1">
        <FormField
          id="add-member-email"
          name="email"
          type="email"
          autoComplete="email"
          label="Member email"
          value={email}
          error={fieldError}
          inputRef={inputRef}
          onChange={setEmail}
        />
      </div>
      <BaseButton type="submit" loading={pending} className="w-full sm:w-auto lg:w-full">
        {pending ? "Adding…" : "Add member"}
      </BaseButton>
    </form>
  );
}

/** Statuses that belong under the email field: bad input, an active member, or an unknown email. */
function isEmailFieldError(error: ApiError): boolean {
  if (error.statusCode === 400 || error.statusCode === 409) return true;
  return error.statusCode === 404 && error.code === "USER_NOT_FOUND";
}
