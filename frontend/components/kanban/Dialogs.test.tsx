import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import { ApiError } from "@/lib/errors";
import { ColumnEditDialog, type ColumnEditDialogProps } from "./ColumnEditDialog";
import { board } from "./kanbanTestData";
import { MoveCardDialog } from "./MoveCardDialog";

const fail = (init: ConstructorParameters<typeof ApiError>[0]): WriteResult<never> => ({
  ok: false,
  error: new ApiError(init),
  handled: false,
});
const ok = <T,>(value: T): WriteResult<T> => ({ ok: true, value });
const escape = (dialog: HTMLElement) => fireEvent(dialog, new Event("cancel", { cancelable: true }));

describe("ColumnEditDialog", () => {
  const column = { id: "c1", board_id: "b", name: "Doing", is_done: false, order: 1024 };

  function setup(over: { locked?: string | null; onSave?: ColumnEditDialogProps["onSave"] } = {}) {
    const onSave = over.onSave ?? vi.fn<ColumnEditDialogProps["onSave"]>().mockResolvedValue(ok(column));
    const onClose = vi.fn();
    render(<ColumnEditDialog column={column} doneLockedReason={over.locked ?? null} onSave={onSave} onClose={onClose} />);
    return { onSave, onClose };
  }

  it("shows the name and the Done toggle, and sends only the changed field", async () => {
    const { onSave, onClose } = setup();
    const dialog = screen.getByRole("dialog", { name: "Edit column" });
    const name = within(dialog).getByLabelText("Column name");
    expect(name).toHaveValue("Doing");
    await userEvent.clear(name);
    await userEvent.type(name, "  In progress ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save column" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("c1", { name: "In progress" });
    expect(onClose).toHaveBeenCalled();
  });

  it("sends the Done flag when it is toggled", async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByLabelText("Done column"));
    await userEvent.click(screen.getByRole("button", { name: "Save column" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("c1", { is_done: true });
  });

  it("closes without a request when nothing changed", async () => {
    const { onSave, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Save column" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a name error from the client and keeps the dialog open", async () => {
    const { onSave, onClose } = setup();
    await userEvent.clear(screen.getByLabelText("Column name"));
    await userEvent.click(screen.getByRole("button", { name: "Save column" }));
    expect(screen.getByText("Must be 1 to 80 characters.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a Done conflict beside the toggle, keeps the entered values and stays open", async () => {
    const onSave = vi.fn<ColumnEditDialogProps["onSave"]>().mockResolvedValue(fail({ statusCode: 409, code: "STATE_CONFLICT", message: "Move or delete the cards in this column before changing its Done flag." }));
    const { onClose } = setup({ onSave });
    await userEvent.clear(screen.getByLabelText("Column name"));
    await userEvent.type(screen.getByLabelText("Column name"), "Renamed");
    await userEvent.click(screen.getByLabelText("Done column"));
    await userEvent.click(screen.getByRole("button", { name: "Save column" }));
    expect(screen.getByText(/before changing its Done flag/)).toBeInTheDocument();
    expect(screen.getByLabelText("Column name")).toHaveValue("Renamed");
    expect(screen.getByLabelText("Done column")).toBeChecked();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables the toggle and says why when the Done flag is locked", () => {
    setup({ locked: "This board already has a Done column." });
    expect(screen.getByLabelText("Done column")).toBeDisabled();
    expect(screen.getByText("This board already has a Done column.")).toBeInTheDocument();
  });

  it("closes on Escape without a request", () => {
    const { onSave, onClose } = setup();
    escape(screen.getByRole("dialog", { name: "Edit column" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("MoveCardDialog (Property 14: one Move_Function)", () => {
  function setup(cardId = "a") {
    const columns = board();
    const moving = columns.flatMap((c) => c.cards).find((c) => c.id === cardId)!;
    const onMove = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<MoveCardDialog card={moving} columns={columns} onMove={onMove} onClose={onClose} />);
    return { onMove, onClose };
  }
  const positions = () => within(screen.getByLabelText("Position")).getAllByRole("option").map((o) => o.textContent);

  it("defaults to the card's column and present place", () => {
    setup("a");
    expect(screen.getByLabelText("Column")).toHaveValue("todo");
    expect(screen.getByLabelText("Position")).toHaveValue("b"); // its next card
    expect(positions()).toEqual(["At the end of the column", "Before Card b"]);
  });

  it("defaults to the end for the last card of a column", () => {
    setup("b");
    expect(screen.getByLabelText("Position")).toHaveValue("end");
    expect(positions()).toEqual(["At the end of the column", "Before Card a"]);
  });

  it("disables Confirm while the selection is the card's present place", async () => {
    const { onMove, onClose } = setup("a");
    const confirm = screen.getByRole("button", { name: "Move card" });
    expect(confirm).toBeDisabled();
    expect(screen.getByText("Choose a different column or position.")).toBeInTheDocument();
    await userEvent.click(confirm);
    expect(onMove).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText("Position"), "At the end of the column");
    expect(confirm).toBeEnabled();
  });

  it("disables Confirm while a Kanban request is pending", () => {
    const columns = board();
    render(<MoveCardDialog card={columns[0].cards[0]} columns={columns} busy onMove={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Move card" })).toBeDisabled();
  });

  it("moves across columns to the end and sends a null anchor", async () => {
    const { onMove, onClose } = setup("a");
    await userEvent.selectOptions(screen.getByLabelText("Column"), "Col doing");
    expect(screen.getByLabelText("Position")).toHaveValue("end");
    expect(positions()).toEqual(["At the end of the column", "Before Card d"]);
    await userEvent.click(screen.getByRole("button", { name: "Move card" }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith("a", "doing", null);
    expect(onClose).toHaveBeenCalled();
  });

  it("moves before a card in another column", async () => {
    const { onMove } = setup("a");
    await userEvent.selectOptions(screen.getByLabelText("Column"), "Col doing");
    await userEvent.selectOptions(screen.getByLabelText("Position"), "Before Card d");
    await userEvent.click(screen.getByRole("button", { name: "Move card" }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith("a", "doing", "d");
  });

  it("reorders inside one column", async () => {
    const { onMove } = setup("a");
    await userEvent.selectOptions(screen.getByLabelText("Position"), "At the end of the column");
    await userEvent.click(screen.getByRole("button", { name: "Move card" }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith("a", "todo", null);
  });

  it("moves into an empty column", async () => {
    const { onMove } = setup("a");
    await userEvent.selectOptions(screen.getByLabelText("Column"), "Col done");
    expect(positions()).toEqual(["At the end of the column"]);
    await userEvent.click(screen.getByRole("button", { name: "Move card" }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith("a", "done", null);
  });

  it("is operable with the keyboard alone", async () => {
    const { onMove } = setup("a");
    await userEvent.tab();
    expect(screen.getByLabelText("Column")).toHaveFocus();
    await userEvent.selectOptions(screen.getByLabelText("Column"), "Col doing");
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Move card" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onMove).toHaveBeenCalledExactlyOnceWith("a", "doing", null);
  });

  it("closes on Escape without a request", () => {
    const { onMove, onClose } = setup();
    escape(screen.getByRole("dialog", { name: "Move card" }));
    expect(onClose).toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("opens from a button and restores focus to it when closed", async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      const columns = board();
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Move Card a
          </button>
          <MoveCardDialog card={open ? columns[0].cards[0] : null} columns={columns} onMove={vi.fn()} onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "Move Card a" });
    await userEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Move card" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(opener).toHaveFocus();
  });
});
