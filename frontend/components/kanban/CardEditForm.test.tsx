import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import { ApiError } from "@/lib/errors";
import { CardEditForm, type CardEditFormProps } from "./CardEditForm";
import { card, MEMBERS } from "./kanbanTestData";

// Carried forward from the CardEditDialog tests (comments design DD9). The form behavior is
// unchanged. Escape and focus return belong to the modal and are tested with CardDetailModal.

const fail = (init: ConstructorParameters<typeof ApiError>[0]): WriteResult<never> => ({
  ok: false,
  error: new ApiError(init),
  handled: false,
});
const ok = <T,>(value: T): WriteResult<T> => ({ ok: true, value });

describe("CardEditForm", () => {
  const edited = card("k1", "c1", 1024, { title: "Fix login", description: "Steps", assignee_id: "u-grace", assignee_name: "Grace" });

  function setup(over: { onSave?: CardEditFormProps["onSave"]; onDelete?: CardEditFormProps["onDelete"]; lockCard?: boolean } = {}) {
    const onSave = over.onSave ?? vi.fn<CardEditFormProps["onSave"]>().mockResolvedValue(ok(edited));
    const onDelete = over.onDelete ?? vi.fn<CardEditFormProps["onDelete"]>().mockResolvedValue(ok(5));
    const onClose = vi.fn();
    render(<CardEditForm card={edited} members={MEMBERS} lockCard={over.lockCard} onSave={onSave} onDelete={onDelete} onClose={onClose} />);
    return { onSave, onDelete, onClose };
  }

  it("shows the title, description and the assignee options from the members", () => {
    setup();
    const form = screen.getByRole("form", { name: "Edit card" });
    expect(within(form).getByLabelText("Title")).toHaveValue("Fix login");
    expect(within(form).getByLabelText("Description")).toHaveValue("Steps");
    expect(within(form).getAllByRole("option").map((o) => o.textContent)).toEqual(["Unassigned", "Ada", "Grace"]);
    expect(within(form).getByLabelText("Assignee")).toHaveValue("u-grace");
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

  it("keeps the form with the message under the field and the entered values after a 400", async () => {
    const onSave = vi.fn<CardEditFormProps["onSave"]>().mockResolvedValue(
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

  it("validates the title length on the client", async () => {
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

  it("deletes after Confirm and closes", async () => {
    const { onDelete, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete card" }));
    const confirm = screen.getByRole("dialog", { name: "Delete card?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete card" }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith("k1");
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps a former participant selectable until the board refetches", () => {
    render(
      <CardEditForm
        card={card("k2", "c1", 1, { assignee_id: "u-gone", assignee_name: "Gone" })}
        members={MEMBERS}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Assignee")).toHaveValue("u-gone");
  });

  it("disables Save card and Delete card while a comment write is pending (lockCard), and sends nothing", async () => {
    const { onSave, onDelete } = setup({ lockCard: true });
    expect(screen.getByRole("button", { name: "Save card" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete card" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Title"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save card" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
