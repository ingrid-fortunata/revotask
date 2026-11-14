import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import { AnalyticsPanel } from "./AnalyticsPanel";

// Feature: analytics, Requirement 6 at component level. The panel is closed by default and reads
// only once it is opened. The real hook runs with a mocked client.

vi.mock("@/lib/apiClient", () => ({ apiGet: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));

const BOARD = "0f9c4f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const onAccessLost = vi.fn();

const FIGURES = {
  week_start: "2026-11-09T00:00:00Z",
  week_end: "2026-11-16T00:00:00Z",
  cards_per_column: [{ column_id: "c1", name: "To do", count: 2 }],
  completed_cards: 3,
  member_activity: [{ user_id: "u1", name: "Ana", count: 4 }],
};
const EMPTY = { ...FIGURES, cards_per_column: [], completed_cards: 0, member_activity: [] };

const flush = () => act(async () => {});
const live = () => dialog().querySelector("[aria-live]") as HTMLElement;
const showButton = () => screen.getByRole("button", { name: "Analytics" });
const dialog = () => screen.getByRole("dialog", { name: "Analytics" });
const visible = (text: string) =>
  screen.queryAllByText(text).filter((element) => !element.classList.contains("sr-only"));
const apiError = (statusCode: number | null, code: string) =>
  new ApiError({ statusCode, code, message: `m ${code}` });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// Renders the closed panel, then opens it and waits for the first read.
async function renderOpen(version = 0) {
  const view = render(<AnalyticsPanel boardId={BOARD} version={version} onAccessLost={onAccessLost} />);
  fireEvent.click(showButton());
  await flush();
  return view;
}

beforeEach(() => {
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiGet).mockResolvedValue(FIGURES);
  onAccessLost.mockReset();
  vi.mocked(hardRedirect).mockReset();
});

describe("closed by default", () => {
  it("shows only the Analytics button and sends no read", () => {
    render(<AnalyticsPanel boardId={BOARD} version={0} onAccessLost={onAccessLost} />);
    expect(showButton()).toHaveAttribute("aria-haspopup", "dialog");
    expect(showButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("the button is a 44 px control and opens the dialog, which reads once", async () => {
    render(<AnalyticsPanel boardId={BOARD} version={0} onAccessLost={onAccessLost} />);
    expect(showButton().className).toMatch(/min-h-11/);
    fireEvent.click(showButton());
    await flush();
    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getByRole("heading", { level: 2, name: "Analytics" })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(showButton()).toHaveAttribute("aria-expanded", "true");
  });

  it("Close and Escape close the dialog and abort the read in flight", async () => {
    const pending = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(pending.promise as never);
    render(<AnalyticsPanel boardId={BOARD} version={0} onAccessLost={onAccessLost} />);
    fireEvent.click(showButton());
    const signal = vi.mocked(apiGet).mock.calls[0][1] as AbortSignal;
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    pending.resolve(FIGURES);
    await flush();
    expect(screen.queryByText("Cards per column")).not.toBeInTheDocument();

    fireEvent.click(showButton());
    await flush();
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reads fresh figures when reopened after a version change", async () => {
    const view = render(<AnalyticsPanel boardId={BOARD} version={0} onAccessLost={onAccessLost} />);
    fireEvent.click(showButton());
    await flush();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    view.rerender(<AnalyticsPanel boardId={BOARD} version={5} onAccessLost={onAccessLost} />);
    await flush();
    expect(apiGet).toHaveBeenCalledTimes(1); // closed, so no read on the version rise
    fireEvent.click(showButton());
    await flush();
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});

describe("states", () => {
  it("shows a loading state before the first response", () => {
    vi.mocked(apiGet).mockReturnValue(new Promise(() => {}));
    render(<AnalyticsPanel boardId={BOARD} version={0} onAccessLost={onAccessLost} />);
    fireEvent.click(showButton());
    expect(visible("Loading analytics…")).toHaveLength(1);
    expect(live()).toHaveTextContent("Loading analytics…");
  });

  it("shows the figures once loaded", async () => {
    await renderOpen();
    expect(within(dialog()).getByText("Week of 9 Nov to 15 Nov, UTC")).toBeInTheDocument();
    expect(within(dialog()).getByText("3")).toBeInTheDocument();
    expect(within(dialog()).getByText("Ana")).toBeInTheDocument();
    expect(visible("Loading analytics…")).toHaveLength(0);
    expect(live()).toHaveTextContent("Analytics up to date.");
  });

  it("shows zeros and the empty states for an empty board without an error", async () => {
    vi.mocked(apiGet).mockResolvedValue(EMPTY);
    await renderOpen();
    expect(within(dialog()).getByText("0")).toBeInTheDocument();
    expect(within(dialog()).getByText("No columns yet.")).toBeInTheDocument();
    expect(within(dialog()).getByText("No activity this week.")).toBeInTheDocument();
    expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is not busy once the first read finishes", async () => {
    await renderOpen();
    expect(within(dialog()).getByRole("button", { name: "Refresh" }).closest("[aria-busy]")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });
});

describe("errors", () => {
  it("shows the error and a Retry that reads again", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(503, "SERVICE_UNAVAILABLE"));
    await renderOpen();
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("Analytics could not be loaded.");
    expect(live()).toHaveTextContent("Analytics could not be loaded.");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Retry" }));
    await flush();
    expect(vi.mocked(apiGet)).toHaveBeenCalledTimes(2);
    expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog()).getByText("Ana")).toBeInTheDocument();
  });

  it("keeps the last figures beside the error after a failed refresh", async () => {
    await renderOpen();
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(null, "NETWORK_ERROR"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Refresh" }));
    await flush();
    expect(within(dialog()).getByRole("alert")).toBeInTheDocument();
    expect(within(dialog()).getByText("Ana")).toBeInTheDocument();
  });

  it("a 404 calls onAccessLost and a 401 redirects to login", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(404, "NOT_FOUND"));
    await renderOpen();
    expect(onAccessLost).toHaveBeenCalledTimes(1);
    expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument();
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(401, "AUTH_REQUIRED"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Refresh" }));
    await flush();
    expect(hardRedirect).toHaveBeenCalledTimes(1);
  });
});

describe("Refresh", () => {
  it("is a named 44 px button that reads again and keeps the figures while busy", async () => {
    await renderOpen();
    const button = within(dialog()).getByRole("button", { name: "Refresh" });
    expect(button.className).toMatch(/min-h-11/);
    expect(button.className).toMatch(/min-w-11/);
    const second = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(second.promise as never);
    fireEvent.click(button);
    expect(button.closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    expect(within(dialog()).getByText("Ana")).toBeInTheDocument();
    expect(visible("Loading analytics…")).toHaveLength(0);
    second.resolve({ ...FIGURES, completed_cards: 8 });
    await flush();
    expect(within(dialog()).getByText("8")).toBeInTheDocument();
    expect(button.closest("[aria-busy]")).toHaveAttribute("aria-busy", "false");
  });

  it("reads again when the version prop rises while open", async () => {
    const view = await renderOpen(0);
    view.rerender(<AnalyticsPanel boardId={BOARD} version={1} onAccessLost={onAccessLost} />);
    await flush();
    expect(vi.mocked(apiGet)).toHaveBeenCalledTimes(2);
  });

  it("uses no role=status, so the board's own status region stays the only one", async () => {
    await renderOpen();
    expect(within(dialog()).queryByRole("status")).not.toBeInTheDocument();
  });
});
