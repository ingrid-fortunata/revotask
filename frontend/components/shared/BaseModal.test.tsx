import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseModal } from "./BaseModal";

// jsdom has no focus trap and no Escape-to-cancel. The setup file stubs showModal and close to
// toggle the `open` attribute, so these tests cover BaseModal's own logic. Tab containment is
// the browser's job and is checked in the real browser by task 7.1 (FE-C3, DD12).

function Host({
  blockClose = false,
  onClose,
}: {
  blockClose?: boolean;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <BaseModal
        open={open}
        labelledBy="modal-title"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        blockClose={blockClose}
        initialFocusRef={nameRef}
      >
        <h2 id="modal-title">Rename board</h2>
        <input ref={nameRef} aria-label="Board name" />
        <button type="button" onClick={() => setOpen(false)}>
          Done
        </button>
      </BaseModal>
    </>
  );
}

function getDialog() {
  return screen.getByRole("dialog", { name: "Rename board" });
}

// Dispatches the browser's cancel event (what Escape triggers) and returns dispatchEvent's result:
// false means the handler called preventDefault.
function pressEscape(element: Element) {
  return fireEvent(element, new Event("cancel", { cancelable: true }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BaseModal", () => {
  it("opens with showModal and moves initial focus to the target", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<Host onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(getDialog()).toHaveAttribute("open");
    expect(screen.getByLabelText("Board name")).toHaveFocus();
  });

  it("renders its content only while open", async () => {
    render(<Host onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Board name")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByLabelText("Board name")).toBeInTheDocument();
  });

  it("calls onClose on Escape, prevents the native close, and leaves closing to the parent", async () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    // Keep a reference: a closed dialog is hidden from getByRole.
    const dialog = getDialog();
    const proceeded = pressEscape(dialog);

    expect(proceeded).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The parent's onClose sets open to false, so the dialog closes only after that.
    expect(dialog).not.toHaveAttribute("open");
  });

  it("ignores Escape while blockClose is true", async () => {
    const onClose = vi.fn();
    render(<Host blockClose onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    const proceeded = pressEscape(getDialog());

    expect(proceeded).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(getDialog()).toHaveAttribute("open");
  });

  it("returns focus to the opener when it closes", async () => {
    render(<Host onClose={vi.fn()} />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    expect(screen.getByLabelText("Board name")).toHaveFocus();
    const dialog = getDialog();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(dialog).not.toHaveAttribute("open");
    expect(opener).toHaveFocus();
  });

  it("uses the bottom sheet below 640 px and a centered modal from sm up", async () => {
    const { container } = render(<Host onClose={vi.fn()} />);
    const dialog = container.querySelector("dialog");
    expect(dialog).toHaveClass("modal", "modal-bottom", "sm:modal-middle");
    expect(dialog).toHaveAttribute("aria-labelledby", "modal-title");

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(container.querySelector(".modal-box")).toHaveClass(
      "w-full",
      "min-w-0",
    );
  });
});
