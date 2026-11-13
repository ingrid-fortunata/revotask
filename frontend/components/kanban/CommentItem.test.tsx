import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CommentWrite } from "@/hooks/useCardComments";
import { formatCommentDay } from "@/lib/comments";
import { CommentItem, type CommentItemProps } from "./CommentItem";
import { CREATED, comment } from "./commentTestData";

// Feature: comments, Properties 11 and 16 (frontend part). The editor, the delete confirmation and
// the Edited marker of one comment. Requests are props, so the tests assert the calls made.

const DAY = formatCommentDay(CREATED);
const ok: CommentWrite = { ok: true };

function setup(over: Partial<CommentItemProps> = {}) {
  const onEdit = vi.fn<CommentItemProps["onEdit"]>().mockResolvedValue(ok);
  const onDelete = vi.fn<CommentItemProps["onDelete"]>().mockResolvedValue(ok);
  const view = render(
    <ul>
      <CommentItem comment={comment("c1", { content: "Original" })} isAuthor disabled={false} onEdit={onEdit} onDelete={onDelete} {...over} />
    </ul>,
  );
  return { onEdit, onDelete, ...view };
}

describe("CommentItem display", () => {
  it("shows the author, a time element with the ISO value, and no Edited marker for equal timestamps (N1)", () => {
    const { container } = setup();
    expect(screen.getByText("Mia")).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute("datetime", CREATED);
    expect(screen.queryByText("Edited")).not.toBeInTheDocument();
  });

  it("shows the Edited text marker only when updated_at is later than created_at", () => {
    setup({ comment: comment("c1", { updated_at: "2026-11-13T10:00:00+00:00" }) });
    expect(screen.getByText("Edited")).toBeInTheDocument();
  });

  it("names the controls after the comment's day, so two comments can be told apart", () => {
    setup();
    expect(screen.getByRole("button", { name: `Edit your comment from ${DAY}` })).toHaveTextContent("Edit");
    expect(screen.getByRole("button", { name: `Delete your comment from ${DAY}` })).toHaveTextContent("Delete");
  });

  it("shows no controls to a non-author", () => {
    setup({ isAuthor: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("disables the controls while a comment request runs", () => {
    setup({ disabled: true });
    expect(screen.getByRole("button", { name: `Edit your comment from ${DAY}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Delete your comment from ${DAY}` })).toBeDisabled();
  });
});

describe("CommentItem editor", () => {
  const editButton = () => screen.getByRole("button", { name: `Edit your comment from ${DAY}` });

  it("opens with the current text focused", async () => {
    setup();
    await userEvent.click(editButton());
    expect(screen.getByLabelText("Edit your comment")).toHaveValue("Original");
    expect(screen.getByLabelText("Edit your comment")).toHaveFocus();
  });

  it("Cancel restores the text and returns focus to the Edit button", async () => {
    const { onEdit } = setup();
    await userEvent.click(editButton());
    await userEvent.type(screen.getByLabelText("Edit your comment"), " more");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(editButton()).toHaveFocus();
    expect(onEdit).not.toHaveBeenCalled();
    await userEvent.click(editButton());
    expect(screen.getByLabelText("Edit your comment")).toHaveValue("Original"); // the draft was reset
  });

  it("sends no request when the trimmed text is unchanged and closes the editor", async () => {
    const { onEdit } = setup();
    await userEvent.click(editButton());
    await userEvent.type(screen.getByLabelText("Edit your comment"), "  ");
    await userEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Edit your comment")).not.toBeInTheDocument();
    expect(editButton()).toHaveFocus();
  });

  it("sends the trimmed new text, closes on success and returns focus", async () => {
    const { onEdit } = setup();
    await userEvent.click(editButton());
    await userEvent.clear(screen.getByLabelText("Edit your comment"));
    await userEvent.type(screen.getByLabelText("Edit your comment"), "  Changed text  ");
    await userEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(onEdit).toHaveBeenCalledExactlyOnceWith("c1", "Changed text");
    expect(screen.queryByLabelText("Edit your comment")).not.toBeInTheDocument();
    expect(editButton()).toHaveFocus();
  });

  it("shows a blank-content message and sends nothing", async () => {
    const { onEdit } = setup();
    await userEvent.click(editButton());
    await userEvent.clear(screen.getByLabelText("Edit your comment"));
    await userEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(screen.getByText("Must be 1 to 2000 characters.")).toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("keeps the editor open with the text and the field error after a 400", async () => {
    const onEdit = vi
      .fn<CommentItemProps["onEdit"]>()
      .mockResolvedValue({ ok: false, handled: false, fields: { content: "Must be 1 to 2000 characters." } });
    setup({ onEdit });
    await userEvent.click(editButton());
    await userEvent.type(screen.getByLabelText("Edit your comment"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(screen.getByText("Must be 1 to 2000 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Edit your comment")).toHaveValue("Original!");
  });

  it("keeps the editor open after a failure the hook already reported", async () => {
    const onEdit = vi.fn<CommentItemProps["onEdit"]>().mockResolvedValue({ ok: false, handled: true, uncertain: true });
    setup({ onEdit });
    await userEvent.click(editButton());
    await userEvent.type(screen.getByLabelText("Edit your comment"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(screen.getByLabelText("Edit your comment")).toHaveValue("Original!");
  });
});

describe("CommentItem delete", () => {
  const deleteButton = () => screen.getByRole("button", { name: `Delete your comment from ${DAY}` });

  it("asks for confirmation, and Cancel sends nothing", async () => {
    const { onDelete } = setup();
    await userEvent.click(deleteButton());
    const confirm = screen.getByRole("dialog", { name: "Delete comment?" });
    expect(within(confirm).getByText(new RegExp(`Delete your comment from ${DAY}`))).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("deletes once after Confirm", async () => {
    const { onDelete } = setup();
    await userEvent.click(deleteButton());
    await userEvent.click(within(screen.getByRole("dialog", { name: "Delete comment?" })).getByRole("button", { name: "Delete comment" }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith("c1");
  });
});
