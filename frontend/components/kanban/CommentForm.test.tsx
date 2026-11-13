import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AddState, CommentWrite } from "@/hooks/useCardComments";
import { CommentForm, type CommentFormProps } from "./CommentForm";

// Feature: comments, Requirements 7.1, 7.2 and 7.12 (the form half of the uncertain add).

function setup(over: Partial<CommentFormProps> = {}) {
  const onAdd = vi.fn<CommentFormProps["onAdd"]>().mockResolvedValue({ ok: true });
  render(<CommentForm pending={false} addState="idle" onAdd={onAdd} {...over} />);
  return { onAdd };
}

const field = () => screen.getByLabelText("Add a comment");
const add = () => screen.getByRole("button", { name: "Add comment" });

describe("CommentForm", () => {
  it("shows a labeled multiline field and an Add comment button", () => {
    setup();
    expect(field().tagName).toBe("TEXTAREA");
    expect(add()).toBeEnabled();
  });

  it("sends the trimmed text and clears the field on success", async () => {
    const { onAdd } = setup();
    await userEvent.type(field(), "  Looks good\nsecond  ");
    await userEvent.click(add());
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("Looks good\nsecond");
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus(); // the button had focus, so the form moved it back to the field
  });

  it("shows a message and sends nothing for a blank or over-long draft", async () => {
    const { onAdd } = setup();
    await userEvent.type(field(), "   ");
    await userEvent.click(add());
    expect(screen.getByText("Must be 1 to 2000 characters.")).toBeInTheDocument();
    await userEvent.clear(field());
    await userEvent.click(screen.getByLabelText("Add a comment"));
    await userEvent.paste("x".repeat(2001));
    await userEvent.click(add());
    expect(screen.getByText("Must be 1 to 2000 characters.")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("keeps the draft and shows the field error after a 400", async () => {
    const result: CommentWrite = { ok: false, handled: false, fields: { content: "Must be 1 to 2000 characters." } };
    const onAdd = vi.fn<CommentFormProps["onAdd"]>().mockResolvedValue(result);
    setup({ onAdd });
    await userEvent.type(field(), "keep me");
    await userEvent.click(add());
    expect(onAdd).toHaveBeenCalled();
    expect(field()).toHaveValue("keep me");
    expect(screen.getByText("Must be 1 to 2000 characters.")).toBeInTheDocument();
  });

  it("keeps the draft after a failure the hook already reported, including an uncertain one", async () => {
    const result: CommentWrite = { ok: false, handled: true, uncertain: true };
    setup({ onAdd: vi.fn<CommentFormProps["onAdd"]>().mockResolvedValue(result) });
    await userEvent.type(field(), "maybe saved");
    await userEvent.click(add());
    expect(field()).toHaveValue("maybe saved");
  });

  it.each<[string, Partial<CommentFormProps>, boolean]>([
    ["idle", { addState: "idle" as AddState }, false],
    ["review (manual retry allowed)", { addState: "review" as AddState }, false],
    ["pending", { pending: true }, true],
    ["checking after an uncertain add", { addState: "checking" as AddState }, true],
    ["refresh-failed", { addState: "refresh-failed" as AddState }, true],
  ])("Add comment is disabled=%s -> %s", async (_label, props, disabled) => {
    const { onAdd } = setup(props);
    if (disabled) {
      expect(add()).toBeDisabled();
      await userEvent.type(field(), "x");
      await userEvent.keyboard("{Enter}");
      expect(onAdd).not.toHaveBeenCalled();
    } else {
      expect(add()).toBeEnabled();
    }
  });
});
