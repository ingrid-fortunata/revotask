import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import { ApiError } from "@/lib/errors";
import { CardEditDialog, type CardEditDialogProps } from "./CardEditDialog";
import { ColumnEditDialog, type ColumnEditDialogProps } from "./ColumnEditDialog";
import { board, card, MEMBERS } from "./kanbanTestData";
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

describe("CardEditDialog", () => {
  const edited = card("k1", "c1", 1024, { title: "Fix login", description: "Steps", assignee_id: "u-grace", assignee_name: "Grace" });

  function setup(over: { onSave?: CardEditDialogProps["onSave"]; onDelete?: CardEditDialogProps["onDelete"] } = {}) {
    const onSave = over.onSave ?? vi.fn<CardEditDialogProps["onSave"]>().mockResolvedValue(ok(edited));
    const onDelete = over.onDelete ?? vi.fn<CardEditDialogProps["onDelete"]>().mockResolvedValue(ok(5));
    const onClose = vi.fn();
    render(<CardEditDialog card={edited} members={MEMBERS} onSave={onSave} onDelete={onDelete} onClose={onClose} />);
    return { onSave, onDelete, onClose };
  }

  it("shows the title, description and the assignee options from the members", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Edit card" });
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Fix login");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("Steps");
    expect(within(dialog).getAllByRole("option").map((o) => o.textContent)).toEqual(["Unassigned", "Ada", "Grace"]);
    expect(within(dialog).getByLabelText("Assignee")).toHaveValue("u-grace");
  });

  it("sends only the changed fields", async () => {
    const { onSave, onClose } = setup();
    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "Fix sign in");
    await userEvent.selectOptions(screen.getByLabelText("Assignee"), "Ada");
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("k1", { title: "Fix sign in", assignee_id: "u-ada" });
    expect(onClose).toHaveBeenCalled();
  });

  it("clears the assignee with null and a blank description with null", async () => {
    const { onSave } = setup();
    await userEvent.selectOptions(screen.getByLabelText("Assignee"), "Unassigned");
    await userEvent.clear(screen.getByLabelText("Description"));
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("k1", { description: null, assignee_id: null });
  });

  it("closes without a request when nothing changed", async () => {
    const { onSave, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the dialog open with the message under the field and the entered values after a 400", async () => {
    const onSave = vi.fn<CardEditDialogProps["onSave"]>().mockResolvedValue(
      fail({ statusCode: 400, code: "VALIDATION_ERROR", message: "Check the submitted fields.", fields: { assignee_id: "Choose a participant of this board." } }),
    );
    const { onClose } = setup({ onSave });
    await userEvent.type(screen.getByLabelText("Title"), " v2");
    await userEvent.selectOptions(screen.getByLabelText("Assignee"), "Ada");
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(screen.getByText("Choose a participant of this board.")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Fix login v2");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("validates the title and the description length on the client", async () => {
    const { onSave } = setup();
    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(screen.getByText("Must be 1 to 160 characters.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("asks for confirmation naming the card before deleting, and Cancel sends nothing", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete card" }));
    const confirm = screen.getByRole("dialog", { name: "Delete card?" });
    expect(within(confirm).getByText(/Fix login/)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("deletes after Confirm and closes the edit dialog", async () => {
    const { onDelete, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete card" }));
    const confirm = screen.getByRole("dialog", { name: "Delete card?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete card" }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith("k1");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape without a request", () => {
    const { onSave, onClose } = setup();
    escape(screen.getByRole("dialog", { name: "Edit card" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps a former participant selectable until the board refetches", () => {
    render(
      <CardEditDialog
        card={card("k2", "c1", 1, { assignee_id: "u-gone", assignee_name: "Gone" })}
        members={MEMBERS}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Assignee")).toHaveValue("u-gone");
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
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(onMove).toHaveBeenCalledTimes(1);
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
