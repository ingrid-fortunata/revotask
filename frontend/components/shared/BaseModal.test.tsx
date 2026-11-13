import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseModal } from "./BaseModal";

// jsdom has no focus trap and no Escape-to-cancel. The setup file stubs showModal and close to
// toggle the `open` attribute, so these tests cover BaseModal's own logic. BaseModal wraps Tab
// itself, because Chrome moves focus out of a modal dialog after its last control (FE-C3, DD12).

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

  it("wraps Tab from the last control to the first and Shift+Tab from the first to the last", async () => {
    render(<Host onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const input = screen.getByLabelText("Board name");
    const done = screen.getByRole("button", { name: "Done" });
    expect(input).toHaveFocus();

    await userEvent.tab();
    expect(done).toHaveFocus();
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(done).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(input).toHaveFocus();
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

describe("BaseModal wide", () => {
  function box(wide?: boolean) {
    render(
      <BaseModal open labelledBy="t" onClose={vi.fn()} wide={wide}>
        <h2 id="t">Title</h2>
      </BaseModal>,
    );
    return screen.getByRole("dialog", { name: "Title" }).querySelector(".modal-box") as HTMLElement;
  }

  it("keeps the default width class", () => {
    const el = box();
    expect(el.className).toContain("max-w-md");
    expect(el.className).not.toContain("max-w-2xl");
  });

  it("switches only the max width and stays w-full min-w-0, so it cannot exceed the viewport", () => {
    const el = box(true);
    expect(el.className).toContain("max-w-2xl");
    expect(el.className).not.toContain("max-w-md");
    expect(el.className).toContain("w-full");
    expect(el.className).toContain("min-w-0");
  });
});

describe("BaseModal nested in another BaseModal", () => {
  function Nested({ onOuterClose, onInnerClose }: { onOuterClose: () => void; onInnerClose: () => void }) {
    return (
      <BaseModal open labelledBy="outer-title" onClose={onOuterClose}>
        <h2 id="outer-title">Outer</h2>
        <button type="button">Outer first</button>
        <BaseModal open labelledBy="inner-title" onClose={onInnerClose}>
          <h2 id="inner-title">Inner</h2>
          <button type="button">Inner action</button>
        </BaseModal>
        <button type="button">Outer last</button>
      </BaseModal>
    );
  }

  it("closes only the inner dialog on Escape, because the cancel event does not bubble to the outer one", () => {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    render(<Nested onOuterClose={onOuterClose} onInnerClose={onInnerClose} />);
    fireEvent(screen.getByRole("dialog", { name: "Inner" }), new Event("cancel", { cancelable: true }));
    expect(onInnerClose).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();
  });

  it("closes the outer dialog on its own Escape", () => {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    render(<Nested onOuterClose={onOuterClose} onInnerClose={onInnerClose} />);
    fireEvent(screen.getByRole("dialog", { name: "Outer" }), new Event("cancel", { cancelable: true }));
    expect(onOuterClose).toHaveBeenCalledTimes(1);
    expect(onInnerClose).not.toHaveBeenCalled();
  });

  it("does not let the outer dialog wrap Tab while focus is in the inner dialog", () => {
    render(<Nested onOuterClose={vi.fn()} onInnerClose={vi.fn()} />);
    const inner = screen.getByRole("button", { name: "Inner action" });
    inner.focus();
    // The inner button is the only control of the inner dialog, so the inner handler wraps to
    // itself. The outer handler must leave the event alone: focus stays on the inner button.
    const proceeded = fireEvent.keyDown(inner, { key: "Tab" });
    expect(proceeded).toBe(false); // the inner dialog handled and prevented it
    expect(inner).toHaveFocus();
  });
});
