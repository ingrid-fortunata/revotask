import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import { ApiError } from "@/lib/errors";
import { AddCardForm } from "./AddCardForm";
import { AddColumnForm } from "./AddColumnForm";
import { card } from "./kanbanTestData";

const fail = (init: ConstructorParameters<typeof ApiError>[0]): WriteResult<never> => ({
  ok: false,
  error: new ApiError(init),
  handled: false,
});

describe("AddCardForm", () => {
  function setup(onAdd = vi.fn().mockResolvedValue({ ok: true, value: card("n", "c1", 1) }), disabled = false) {
    render(<AddCardForm columnId="c1" columnName="To do" disabled={disabled} onAdd={onAdd} />);
    if (!disabled) fireEvent.click(screen.getByRole("button", { name: "Add card to To do" }));
    return { onAdd, input: disabled ? null : screen.getByLabelText("New card") };
  }

  it("shows only a button until clicked, then opens a modal with the field", () => {
    render(<AddCardForm columnId="c1" columnName="To do" disabled={false} onAdd={vi.fn()} />);
    expect(screen.queryByLabelText("New card")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add card to To do" }));
    expect(screen.getByRole("dialog", { name: "Add card to To do" })).toBeInTheDocument();
    expect(screen.getByLabelText("New card")).toHaveFocus();
  });

  it("is named for its column, so each lane's form is distinct", () => {
    setup();
    expect(screen.getByRole("form", { name: "Add card to To do" })).toBeInTheDocument();
  });

  it("adds a trimmed title and closes the modal", async () => {
    const { onAdd, input } = setup();
    await userEvent.type(input!, "  Fix login  ");
    await userEvent.click(screen.getByRole("button", { name: "Add card" }));
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("Fix login");
    await waitFor(() => expect(screen.queryByLabelText("New card")).not.toBeInTheDocument());
  });

  it("closes on Cancel without adding", async () => {
    const { onAdd } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New card")).not.toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows a client error for a blank title and sends nothing", async () => {
    const { onAdd } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Add card" }));
    expect(screen.getByText("Must be 1 to 160 characters.")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows the server's field error and keeps the title after a 400", async () => {
    const onAdd = vi.fn().mockResolvedValue(
      fail({ statusCode: 400, code: "VALIDATION_ERROR", message: "Check the submitted fields.", fields: { title: "Must be 1 to 160 characters." } }),
    );
    const { input } = setup(onAdd);
    await userEvent.type(input!, "Kept");
    await userEvent.click(screen.getByRole("button", { name: "Add card" }));
    expect(screen.getByText("Must be 1 to 160 characters.")).toBeInTheDocument();
    expect(input).toHaveValue("Kept");
    expect(screen.getByRole("dialog", { name: "Add card to To do" })).toBeInTheDocument();
  });

  it("disables the button while the board is busy", () => {
    setup(undefined, true);
    expect(screen.getByRole("button", { name: "Add card to To do" })).toBeDisabled();
  });
});

describe("AddColumnForm", () => {
  function setup(hasDone = false, onAdd = vi.fn().mockResolvedValue({ ok: true, value: {} })) {
    render(<AddColumnForm hasDone={hasDone} disabled={false} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    return { onAdd };
  }

  const submit = () => within(screen.getByRole("form", { name: "Add column" })).getByRole("button", { name: "Add column" });

  it("shows only a button until clicked, then opens a modal", () => {
    render(<AddColumnForm hasDone={false} disabled={false} onAdd={vi.fn()} />);
    expect(screen.queryByLabelText("Column name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getByRole("dialog", { name: "Add column" })).toBeInTheDocument();
    expect(screen.getByLabelText("Column name")).toHaveFocus();
  });

  it("adds a column with the Done flag and closes the modal", async () => {
    const { onAdd } = setup();
    await userEvent.type(screen.getByLabelText("Column name"), "Shipped");
    await userEvent.click(screen.getByLabelText("Done column"));
    await userEvent.click(submit());
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("Shipped", true);
    await waitFor(() => expect(screen.queryByLabelText("Column name")).not.toBeInTheDocument());
  });

  it("disables the Done checkbox with a text reason while a Done column exists", async () => {
    const { onAdd } = setup(true);
    const box = screen.getByLabelText("Done column");
    expect(box).toBeDisabled();
    expect(screen.getByText("This board already has a Done column.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Column name"), "Review");
    await userEvent.click(submit());
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("Review", false);
  });

  it("rejects a blank name on the client", async () => {
    const { onAdd } = setup();
    await userEvent.click(submit());
    expect(screen.getByText("Must be 1 to 80 characters.")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("keeps the name and shows a Done-column conflict beside the checkbox", async () => {
    const onAdd = vi.fn().mockResolvedValue(fail({ statusCode: 409, code: "STATE_CONFLICT", message: "A board can have only one Done column." }));
    setup(false, onAdd);
    await userEvent.type(screen.getByLabelText("Column name"), "Shipped");
    await userEvent.click(screen.getByLabelText("Done column"));
    await userEvent.click(submit());
    const form = screen.getByRole("form", { name: "Add column" });
    expect(within(form).getByText("A board can have only one Done column.")).toBeInTheDocument();
    expect(screen.getByLabelText("Column name")).toHaveValue("Shipped");
  });

  it("makes the checkbox itself 44 px (FE-S5)", () => {
    setup();
    expect(screen.getByLabelText("Done column").className).toMatch(/\[--size:2\.75rem\]/);
  });
});
