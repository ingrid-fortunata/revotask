import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

// Tab containment is provided by the browser's modal dialog and is verified in the real browser
// by task 7.1. These tests run in jsdom, where the setup file stubs showModal and close.

const TARGET = "Remove Ada from this board?";

function renderDialog(overrides: Partial<ConfirmDialogProps> = {}) {
  const props: ConfirmDialogProps = {
    open: true,
    title: "Remove member",
    message: TARGET,
    confirmLabel: "Remove",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<ConfirmDialog {...props} />);
  return props;
}

function getDialog() {
  return screen.getByRole("dialog", { name: "Remove member" });
}

function pressEscape(element: Element) {
  return fireEvent(element, new Event("cancel", { cancelable: true }));
}

// Opens from a trigger button and closes through the parent, as the Members_Panel and Board_Page do.
function Host({
  onConfirm,
  pending = false,
}: {
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Remove Ada
      </button>
      <ConfirmDialog
        open={open}
        title="Remove member"
        message={TARGET}
        confirmLabel="Remove"
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConfirmDialog", () => {
  it("names the target, labels the dialog by its title and describes it by its message", () => {
    renderDialog();
    const dialog = getDialog();

    expect(
      within(dialog).getByRole("heading", { name: "Remove member" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(TARGET)).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription(TARGET);
  });

  it("shows Cancel and the confirm label, and focuses Cancel on open", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Remove" })).not.toHaveFocus();
  });

  it("calls onCancel and not onConfirm when Cancel is clicked", async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel and not onConfirm on Escape", () => {
    const { onConfirm, onCancel } = renderDialog();

    const proceeded = pressEscape(getDialog());

    expect(proceeded).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm exactly once when Confirm is clicked and never on Cancel", async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("moves focus between Cancel and Confirm with Tab in the dialog's order", async () => {
    renderDialog();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Remove" });

    expect(cancel).toHaveFocus();
    await userEvent.tab();
    expect(confirm).toHaveFocus();
  });

  it("disables both buttons, marks Confirm busy and blocks Escape while pending", async () => {
    const { onConfirm, onCancel } = renderDialog({ pending: true });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Remove" });

    expect(cancel).toBeDisabled();
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(getDialog().querySelector(".loading-spinner")).not.toBeNull();

    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    pressEscape(getDialog());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("returns focus to the element that opened the dialog after it closes", async () => {
    render(<Host onConfirm={vi.fn()} />);
    const opener = screen.getByRole("button", { name: "Remove Ada" });
    await userEvent.click(opener);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    const dialog = getDialog();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(dialog).not.toHaveAttribute("open");
    expect(opener).toHaveFocus();
  });

  it("uses the bottom sheet below 640 px and stacks full-width buttons below 640 px", () => {
    renderDialog();
    const dialog = getDialog();
    expect(dialog).toHaveClass("modal-bottom", "sm:modal-middle");

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Remove" });
    const actions = cancel.parentElement;
    expect(actions).toHaveClass(
      "modal-action",
      "flex",
      "flex-col",
      "gap-2",
      "sm:flex-row",
    );
    for (const button of [cancel, confirm]) {
      expect(button).toHaveClass("w-full", "sm:w-auto", "min-h-11", "min-w-11");
    }
  });
});
