"use client";

import { useId, useRef } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { BaseModal } from "@/components/shared/BaseModal";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Names the target, for example "Remove Ada from this board?". */
  message: string;
  confirmLabel: string;
  /** True while the request runs. Disables both buttons and blocks Escape. */
  pending?: boolean;
  /** Runs only when the user confirms. Cancel and Escape never call it. */
  onConfirm: () => void;
  /** Runs on Cancel and on Escape, when not pending. It must not call the API. */
  onCancel: () => void;
}

// Built on BaseModal (FE-C3, DD12). Focus starts on Cancel, so a stray Enter cannot delete.
// Buttons stack full width below 640 px and sit in a row from 640 px up (FE-S4, FE-S5).
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  return (
    <BaseModal
      open={open}
      labelledBy={titleId}
      describedBy={messageId}
      onClose={onCancel}
      blockClose={pending}
      initialFocusRef={cancelRef}
    >
      <h2 id={titleId} className="break-words text-lg font-bold">
        {title}
      </h2>
      <p id={messageId} className="mt-2 break-words text-base">
        {message}
      </p>
      <div className="modal-action flex flex-col gap-2 sm:flex-row sm:justify-end">
        <BaseButton
          ref={cancelRef}
          variant="ghost"
          className="w-full sm:w-auto"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </BaseButton>
        <BaseButton className="w-full sm:w-auto" loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </BaseButton>
      </div>
    </BaseModal>
  );
}
