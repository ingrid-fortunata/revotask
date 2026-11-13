"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

// Keeps Tab and Shift+Tab inside the open dialog (FE-C3). Chrome does not wrap focus in a modal
// dialog: after the last control, focus moves to the browser UI (document.body in the page). So
// this handler wraps focus at both ends and calls preventDefault, which stops that move.
function keepTabInside(event: ReactKeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const dialog = event.currentTarget;
  const controls = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
  if (controls.length === 0) {
    event.preventDefault();
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  const active = document.activeElement;
  const outside = !(active instanceof Node) || !dialog.contains(active);
  if (event.shiftKey) {
    if (outside || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (outside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

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
// background and Escape (through the cancel event). This wrapper adds the Tab wrap (keepTabInside),
// the initial focus target, focus return to the element that opened the dialog, and the pending block.
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
      onKeyDown={keepTabInside}
      onCancel={(event) => {
        // Stop the browser from closing the dialog, so `open` stays under the parent's control.
        event.preventDefault();
        if (!blockClose) onClose();
      }}
    >
      <div className="modal-box w-full max-w-md min-w-0">
        {open ? children : null}
      </div>
    </dialog>
  );
}
