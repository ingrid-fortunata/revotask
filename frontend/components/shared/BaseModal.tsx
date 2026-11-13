"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

export interface BaseModalProps {
  open: boolean;
  /** Id of the element that names the dialog. */
  labelledBy: string;
  /** Id of the element that describes the dialog. */
  describedBy?: string;
  /** Called on Escape or any close request. The parent sets `open` to false in response. */
  onClose: () => void;
  /** While true, Escape does nothing. The parent also disables its own close controls. */
  blockClose?: boolean;
  /** Receives focus when the dialog opens. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

// Wraps the native <dialog> and calls showModal() (DD12). The browser provides the inert
// background, Tab containment and Escape (through the cancel event). This wrapper adds the
// initial focus target, focus return to the element that opened the dialog, and the pending block.
// Content mounts only while open, so hidden controls stay out of the accessibility tree.
export function BaseModal({
  open,
  labelledBy,
  describedBy,
  onClose,
  blockClose = false,
  initialFocusRef,
  children,
}: BaseModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.hasAttribute("open")) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
      dialog.showModal();
      initialFocusRef?.current?.focus();
      return;
    }
    if (!open && dialog.hasAttribute("open")) {
      dialog.close();
      openerRef.current?.focus();
      openerRef.current = null;
    }
  }, [open, initialFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="modal modal-bottom sm:modal-middle"
      onCancel={(event) => {
        // Stop the browser from closing the dialog, so `open` stays under the parent's control.
        event.preventDefault();
        if (!blockClose) onClose();
      }}
    >
      <div className="modal-box w-full max-w-md min-w-0">{open ? children : null}</div>
    </dialog>
  );
}
