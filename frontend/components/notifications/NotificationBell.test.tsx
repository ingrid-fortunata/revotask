import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import type { NotificationItem, NotificationPage } from "@/lib/types";
import { NotificationBell } from "./NotificationBell";

// Feature: notifications, Requirements 6.1 to 6.3, 6.6, 7.1, 7.4 and Property 14. The real hook runs
// against a mocked API client.

vi.mock("@/lib/apiClient", () => ({ apiGet: vi.fn(), apiRequest: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const note = (id: string, readAt: string | null = null): NotificationItem => ({
  id,
  kind: "assigned",
  board_id: `board-${id}`,
  card_id: "card",
  actor_id: "actor",
  actor_name: "Ana",
  board_name: "Launch",
  card_title: `Card ${id}`,
  created_at: "2026-11-14T02:00:00+00:00",
  read_at: readAt,
});

const pageOf = (items: NotificationItem[], extra: Partial<NotificationPage> = {}): NotificationPage => ({
  items,
  page: 1,
  per_page: 20,
  total: items.length,
  unread_count: items.filter((item) => item.read_at === null).length,
  ...extra,
});

async function renderBell(data: NotificationPage) {
  vi.mocked(apiGet).mockResolvedValue(data);
  render(<NotificationBell />);
  await act(async () => {});
}

const bell = () => screen.getByRole("button", { name: /^Notifications/ });

beforeEach(() => {
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(notifyError).mockReset();
});

describe("badge and name", () => {
  it("shows no badge and the plain name before the first response", () => {
    vi.mocked(apiGet).mockReturnValue(new Promise(() => {}));
    render(<NotificationBell />);
    expect(bell()).toHaveAccessibleName("Notifications");
    expect(bell().textContent).toBe("");
  });

  it("shows no badge at 0", async () => {
    await renderBell(pageOf([], { total: 0, unread_count: 0 }));
    expect(bell()).toHaveAccessibleName("Notifications");
    expect(bell().textContent).toBe("");
  });

  it("shows the count in the badge and the exact count in the name", async () => {
    await renderBell(pageOf([note("a")], { total: 3, unread_count: 3 }));
    expect(bell()).toHaveAccessibleName("Notifications, 3 unread");
    expect(bell()).toHaveTextContent("3");
  });

  it("caps the badge at 99+ but keeps the exact count in the name", async () => {
    await renderBell(pageOf([note("a")], { total: 120, unread_count: 120 }));
    expect(bell()).toHaveAccessibleName("Notifications, 120 unread");
    expect(bell()).toHaveTextContent("99+");
  });

  it("is a dialog trigger with a 44 px target and a visible focus ring class", async () => {
    await renderBell(pageOf([note("a")]));
    expect(bell()).toHaveAttribute("aria-haspopup", "dialog");
    expect(bell()).toHaveClass("min-h-11", "min-w-11", "focus-visible:outline-2");
  });
});

describe("panel", () => {
  it("opens the Notifications dialog with the rows, and closes with Escape and returns focus", async () => {
    await renderBell(pageOf([note("a"), note("b", "2026-11-14T03:00:00+00:00")]));
    await userEvent.click(bell());
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    expect(await within(dialog).findAllByRole("listitem")).toHaveLength(2);
    // The browser fires `cancel` for Escape. jsdom does not, so dispatch it the same way.
    await act(async () => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true, bubbles: true }));
    });
    expect(dialog).not.toHaveAttribute("open");
    expect(bell()).toHaveFocus();
  });
});

describe("following a row's link (Property 14)", () => {
  async function openAndFollow(name: string) {
    await userEvent.click(bell());
    const link = await screen.findByRole("link", { name });
    // Read whether any handler stopped the click. A document listener sees it after React's
    // handlers, then silences jsdom's "navigation not implemented" itself.
    let stopped = false;
    const spy = (event: Event) => {
      stopped = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", spy);
    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    document.removeEventListener("click", spy);
    return !stopped;
  }

  it("marks an unread row read, closes the panel and does not stop the navigation", async () => {
    await renderBell(pageOf([note("a")]));
    vi.mocked(apiRequest).mockResolvedValue(note("a", "2026-11-14T03:00:00+00:00"));
    expect(await openAndFollow("Ana assigned you to Card a")).toBe(true);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiRequest).mock.calls[0][0]).toBe("PATCH");
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("still navigates when marking fails, and shows no toast", async () => {
    await renderBell(pageOf([note("a")]));
    vi.mocked(apiRequest).mockRejectedValue(new ApiError({ statusCode: 500, code: "INTERNAL_ERROR", message: "x" }));
    expect(await openAndFollow("Ana assigned you to Card a")).toBe(true);
    await act(async () => {});
    expect(notifyError).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("sends no request for a read row", async () => {
    await renderBell(pageOf([note("b", "2026-11-14T03:00:00+00:00")]));
    expect(await openAndFollow("Ana assigned you to Card b")).toBe(true);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
