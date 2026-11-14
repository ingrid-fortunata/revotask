import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { NotificationItem } from "@/lib/types";
import { NotificationPanel, type NotificationPanelProps } from "./NotificationPanel";

// Feature: notifications, Requirements 7.2 to 7.11, 9.3 and 9.5. The panel is props only, so each
// test passes the state it wants and asserts the rendered text, roles and the callbacks.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const note = (id: string, extra: Partial<NotificationItem> = {}): NotificationItem => ({
  id,
  kind: "assigned",
  board_id: `board-${id}`,
  card_id: `card-${id}`,
  actor_id: "actor",
  actor_name: "Ana",
  board_name: "Launch",
  card_title: `Card ${id}`,
  created_at: "2026-11-14T02:00:00+00:00",
  read_at: null,
  ...extra,
});

function props(extra: Partial<NotificationPanelProps> = {}): NotificationPanelProps {
  return {
    open: true,
    onClose: vi.fn(),
    items: [note("a"), note("b", { kind: "commented", read_at: "2026-11-14T03:00:00+00:00" })],
    page: 1,
    pageCount: 1,
    total: 2,
    unread: 1,
    status: "ready",
    markingId: null,
    rowNotice: null,
    announcement: "",
    onRetry: vi.fn(),
    onPage: vi.fn(),
    onMark: vi.fn(),
    onFollow: vi.fn(),
    ...extra,
  };
}

const dialog = () => screen.getByRole("dialog", { name: "Notifications" });

describe("rows", () => {
  it("writes the sentence for each kind and links to the board", () => {
    render(<NotificationPanel {...props()} />);
    const assigned = screen.getByRole("link", { name: "Ana assigned you to Card a" });
    expect(assigned).toHaveAttribute("href", "/boards/board-a");
    expect(screen.getByRole("link", { name: "Ana commented on Card b" })).toHaveAttribute("href", "/boards/board-b");
    expect(within(dialog()).getAllByText("Launch", { exact: false })).toHaveLength(2);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows the Unread marker as text on an unread row only, and the count line", () => {
    render(<NotificationPanel {...props()} />);
    const [unreadRow, readRow] = screen.getAllByRole("listitem");
    expect(within(unreadRow).getByText("Unread")).toBeInTheDocument();
    expect(within(readRow).queryByText("Unread")).not.toBeInTheDocument();
    expect(screen.getByText("1 unread of 2")).toBeInTheDocument();
  });

  it("renders markup in a title, board and actor as literal text", () => {
    const hostile = note("x", { card_title: "<img src=x onerror=alert(1)>", actor_name: "<b>Eve</b>", board_name: "<i>Board</i>" });
    render(<NotificationPanel {...props({ items: [hostile], total: 1 })} />);
    expect(screen.getByRole("link", { name: "<b>Eve</b> assigned you to <img src=x onerror=alert(1)>" })).toBeInTheDocument();
    expect(screen.getByText("<i>Board</i>", { exact: false })).toBeInTheDocument();
    expect(dialog().querySelector("img, b, i")).toBeNull();
  });

  it("calls onFollow with the item when the link is followed, and does not stop the click", async () => {
    const onFollow = vi.fn();
    render(<NotificationPanel {...props({ onFollow })} />);
    const link = screen.getByRole("link", { name: "Ana assigned you to Card a" });
    let prevented = true;
    const spy = (event: Event) => {
      prevented = event.defaultPrevented;
      event.preventDefault(); // silences jsdom's "navigation not implemented"
    };
    document.addEventListener("click", spy);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    document.removeEventListener("click", spy);
    expect(onFollow).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(prevented).toBe(false);
  });
});

describe("Mark as read", () => {
  it("shows the button on an unread row only, named after its row, and calls onMark", async () => {
    const onMark = vi.fn();
    render(<NotificationPanel {...props({ onMark })} />);
    const buttons = screen.getAllByRole("button", { name: /^Mark as read:/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Mark as read: Ana assigned you to Card a");
    await userEvent.click(buttons[0]);
    expect(onMark).toHaveBeenCalledWith("a");
  });

  it("disables every button while a mark runs and shows the busy state on that row", () => {
    const items = [note("a"), note("b")];
    render(<NotificationPanel {...props({ items, total: 2, unread: 2, markingId: "a" })} />);
    const [first, second] = screen.getAllByRole("button", { name: /^Mark as read:/ });
    expect(first).toBeDisabled();
    expect(first).toHaveAttribute("aria-busy", "true");
    expect(second).toBeDisabled();
    expect(second).not.toHaveAttribute("aria-busy");
  });

  it("shows a row notice with role alert under its row only", () => {
    render(<NotificationPanel {...props({ rowNotice: { id: "a", text: "The notification was not marked as read. Try again." } })} />);
    const [row, other] = screen.getAllByRole("listitem");
    expect(within(row).getByRole("alert")).toHaveTextContent("not marked as read");
    expect(within(other).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("states", () => {
  it("shows loading and no rows or paging while loading", () => {
    render(<NotificationPanel {...props({ status: "loading", pageCount: 3 })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading notifications…");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Older" })).not.toBeInTheDocument();
  });

  it("shows the empty state with what produces a notification", () => {
    render(<NotificationPanel {...props({ items: [], total: 0, unread: 0 })} />);
    expect(screen.getByText("You have no notifications.")).toBeInTheDocument();
    expect(screen.getByText(/assigns you a card or comments on a card assigned to you/)).toBeInTheDocument();
  });

  it("shows an error with Retry and keeps the rows already shown", async () => {
    const onRetry = vi.fn();
    render(<NotificationPanel {...props({ status: "error", onRetry })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Notifications could not be loaded.");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("carries the announcement in a polite live region", () => {
    render(<NotificationPanel {...props({ announcement: "Marked as read." })} />);
    const region = screen.getByText("Marked as read.");
    expect(region).toHaveAttribute("aria-live", "polite");
  });
});

describe("paging", () => {
  it("shows no paging at one page", () => {
    render(<NotificationPanel {...props()} />);
    expect(screen.queryByRole("button", { name: "Older" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Page \d+ of/)).not.toBeInTheDocument();
  });

  it("disables Newer on the first page and Older on the last, and pages through onPage", async () => {
    const onPage = vi.fn();
    const { rerender } = render(<NotificationPanel {...props({ page: 1, pageCount: 3, total: 45, onPage })} />);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Newer" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Older" }));
    expect(onPage).toHaveBeenLastCalledWith(2);
    rerender(<NotificationPanel {...props({ page: 3, pageCount: 3, total: 45, onPage })} />);
    expect(screen.getByRole("button", { name: "Older" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Newer" }));
    expect(onPage).toHaveBeenLastCalledWith(2);
  });
});

describe("dialog", () => {
  it("is a named dialog with a Close control, and renders nothing inside while closed", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<NotificationPanel {...props({ onClose })} />);
    await userEvent.click(screen.getByRole("button", { name: "Close notifications" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<NotificationPanel {...props({ open: false })} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("sizes every control for touch (FE-S5): the link and buttons use the 44 px classes", () => {
    render(<NotificationPanel {...props({ pageCount: 2, total: 25 })} />);
    expect(screen.getByRole("link", { name: "Ana assigned you to Card a" })).toHaveClass("min-h-11");
    for (const name of ["Close notifications", /^Mark as read:/, "Newer", "Older"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("min-h-11", "min-w-11");
    }
  });
});
