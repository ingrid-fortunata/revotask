import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentList } from "./CommentList";
import { comment, ME } from "./commentTestData";

// Feature: comments, Properties 11 and 15 (list level): author-only controls and plain text.

const noop = vi.fn();
const props = { currentUserId: ME.id, disabled: false, onEdit: noop, onDelete: noop };

describe("CommentList", () => {
  it("shows No comments yet. for an empty list", () => {
    render(<CommentList comments={[]} {...props} />);
    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows a list item per comment in the order given, with author and content", () => {
    render(
      <CommentList
        comments={[
          comment("c1", { content: "first" }),
          comment("c2", { author_id: "u-omar", author_name: "Omar", content: "second" }),
        ]}
        {...props}
      />,
    );
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Mia")).toBeInTheDocument();
    expect(within(items[0]).getByText("first")).toBeInTheDocument();
    expect(within(items[1]).getByText("Omar")).toBeInTheDocument();
  });

  it("Property 11: shows Edit and Delete only on the current user's own comments", () => {
    render(
      <CommentList
        comments={[comment("c1"), comment("c2", { author_id: "u-omar", author_name: "Omar" })]}
        {...props}
      />,
    );
    const [mine, theirs] = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(within(mine).getAllByRole("button").map((b) => b.textContent)).toEqual(["Edit", "Delete"]);
    expect(within(theirs).queryByRole("button")).not.toBeInTheDocument();
  });

  it("Property 11: an admin who is not the author sees no controls on another user's comment", () => {
    render(<CommentList comments={[comment("c1")]} {...props} currentUserId="u-admin" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("Property 15: shows markup as literal text and keeps line breaks", () => {
    const content = "<b>bold</b> & <script>alert(1)</script>\nsecond line";
    const { container } = render(<CommentList comments={[comment("c1", { content })]} {...props} />);
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    const text = screen.getByText((_, el) => el?.tagName === "P" && el.textContent === content);
    expect(text.className).toMatch(/whitespace-pre-wrap/);
    expect(text.className).toMatch(/break-words/);
  });
});
