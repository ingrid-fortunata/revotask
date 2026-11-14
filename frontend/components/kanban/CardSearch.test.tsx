import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import type { ColumnWithCards } from "@/lib/types";
import { CardSearch } from "./CardSearch";
import { board, BOARD_ID, card, column } from "./kanbanTestData";

// Feature: my-tasks-search, Requirement 5 and Properties 6 to 8 at component level. The real hook
// runs with fake timers and a mocked client.

vi.mock("@/lib/apiClient", () => ({ apiGet: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));

const onOpenCard = vi.fn();
const onAccessLost = vi.fn();

const hit = (id: string, title: string, columnId = "todo") => ({ id, title, column_id: columnId });

function renderSearch(columns: ColumnWithCards[] = board()) {
  const view = render(<CardSearch boardId={BOARD_ID} columns={columns} onOpenCard={onOpenCard} onAccessLost={onAccessLost} />);
  return {
    ...view,
    update: (next: ColumnWithCards[]) =>
      view.rerender(<CardSearch boardId={BOARD_ID} columns={next} onOpenCard={onOpenCard} onAccessLost={onAccessLost} />),
  };
}

const live = () => document.querySelector("[aria-live]") as HTMLElement;
const field = () => screen.getByLabelText("Search cards") as HTMLInputElement;
const typeText = (text: string) => fireEvent.change(field(), { target: { value: text } });
const settle = () => act(() => vi.advanceTimersByTimeAsync(300));
const search = async (text: string) => {
  typeText(text);
  await settle();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(apiGet).mockReset();
  onOpenCard.mockReset();
  onAccessLost.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("the field and the idle state", () => {
  it("has a visible label, search type, a 100 limit and 16 px text", () => {
    renderSearch();
    expect(field()).toHaveAttribute("type", "search");
    expect(field()).toHaveAttribute("maxlength", "100");
    expect(field()).toHaveClass("text-base", "min-h-11");
    expect(screen.getByText("Search cards")).toBeVisible();
  });

  it("shows nothing about results while idle, and the live region is empty", () => {
    renderSearch();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText(/No cards match “/)).toBeNull();
    expect(screen.queryByText("Searching…")).toBeNull();
    expect(live()).toHaveTextContent("");
  });
});

describe("loading, results and no results", () => {
  it("shows Searching… during the debounce and the request", async () => {
    vi.mocked(apiGet).mockReturnValue(new Promise(() => {}));
    renderSearch();
    typeText("card");
    expect(screen.getByText("Searching…", { selector: "p[aria-busy]" })).toBeVisible();
    await settle();
    expect(screen.getByText("Searching…", { selector: "p[aria-busy]" })).toBeVisible();
    expect(live()).toHaveTextContent("Searching…");
  });

  it("lists each result with its title and column name and announces the count", async () => {
    vi.mocked(apiGet).mockResolvedValue([hit("a", "Card a"), hit("d", "Card d", "doing")]);
    renderSearch();
    await search("card");
    const list = screen.getByRole("list", { name: "Search results" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Card a, in Col todo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Card d, in Col doing" })).toBeVisible();
    expect(live()).toHaveTextContent("2 results");
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it("selecting a result opens that card", async () => {
    vi.mocked(apiGet).mockResolvedValue([hit("d", "Card d", "doing")]);
    renderSearch();
    await search("card");
    fireEvent.click(screen.getByRole("button", { name: "Card d, in Col doing" }));
    expect(onOpenCard).toHaveBeenCalledWith("d");
  });

  it("shows a distinct no-result message with the query as text", async () => {
    vi.mocked(apiGet).mockResolvedValue([]);
    renderSearch();
    await search("zzz");
    expect(screen.getByText(/No cards match “/)).toHaveTextContent("No cards match “zzz”.");
    expect(live()).toHaveTextContent("No cards match.");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("renders markup in a title as text", async () => {
    const columns = [column("todo", 1, [card("x", "todo", 1, { title: "<b>bold</b> card" })])];
    vi.mocked(apiGet).mockResolvedValue([hit("x", "<b>bold</b> card")]);
    const { container } = renderSearch(columns);
    await search("bold");
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>bold</b> card")).toBeVisible();
  });

  it("clears the results and the message at once when the field is emptied", async () => {
    vi.mocked(apiGet).mockResolvedValue([hit("a", "Card a")]);
    renderSearch();
    await search("card");
    typeText("");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("Searching…")).toBeNull();
    expect(live()).toHaveTextContent("");
  });
});

describe("errors", () => {
  it("shows the error message with Retry and keeps the typed text", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(new ApiError({ statusCode: 500, code: "INTERNAL_ERROR", message: "x" }));
    renderSearch();
    await search("card");
    expect(screen.getByText("Search could not be completed.", { selector: "p:not(.sr-only)" })).toBeVisible();
    expect(field().value).toBe("card");
    expect(live()).toHaveTextContent("Search could not be completed.");
    vi.mocked(apiGet).mockResolvedValueOnce([hit("a", "Card a")]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    expect(screen.getByRole("button", { name: "Card a, in Col todo" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows the field message of a 400 and no Retry", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(
      new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "x", fields: { q: "Enter valid text." } }),
    );
    renderSearch();
    await search("card");
    expect(screen.getByText("Enter valid text.", { selector: "p:not(.sr-only)" })).toBeVisible();
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("tells the board when access is lost (a 404)", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "x" }));
    renderSearch();
    await search("card");
    expect(onAccessLost).toHaveBeenCalledTimes(1);
  });
});

describe("the result count line (Q1)", () => {
  const twenty = () => Array.from({ length: 20 }, (_, n) => card(`k${n}`, "todo", n + 1, { title: `Hit ${n}` }));
  const twentyHits = () => twenty().map((c) => hit(c.id, c.title));

  it("shows Showing 20 results. when the response held 20", async () => {
    vi.mocked(apiGet).mockResolvedValue(twentyHits());
    renderSearch([column("todo", 1, twenty())]);
    await search("hit");
    expect(screen.getByText("Showing 20 results.")).toBeVisible();
  });

  it("does not show the line for fewer than 20", async () => {
    vi.mocked(apiGet).mockResolvedValue(twentyHits().slice(0, 19));
    renderSearch([column("todo", 1, twenty())]);
    await search("hit");
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it("shows the visible count when one result becomes hidden", async () => {
    vi.mocked(apiGet).mockResolvedValue(twentyHits());
    const view = renderSearch([column("todo", 1, twenty())]);
    await search("hit");
    view.update([column("todo", 1, twenty().slice(1))]);
    expect(screen.getByText("Showing 19 results.")).toBeVisible();
  });

  it("shows the empty state and no line when every result is hidden", async () => {
    vi.mocked(apiGet).mockResolvedValue(twentyHits());
    const view = renderSearch([column("todo", 1, twenty())]);
    await search("hit");
    view.update([column("todo", 1, [])]);
    expect(screen.getByText(/No cards match “/)).toBeVisible();
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("results follow the live board (S8, Q2; properties 6 to 8)", () => {
  async function withResults(columns = board()) {
    vi.mocked(apiGet).mockResolvedValue([hit("a", "Card a"), hit("b", "Card b")]);
    const view = renderSearch(columns);
    await search("card");
    return view;
  }

  it("hides a result whose edited title no longer matches", async () => {
    const view = await withResults();
    const next = board();
    next[0].cards[0] = { ...next[0].cards[0], title: "Renamed" };
    view.update(next);
    expect(screen.queryByRole("button", { name: /Renamed/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Card b, in Col todo" })).toBeVisible();
  });

  it("shows the new title when the edit still matches", async () => {
    const view = await withResults();
    const next = board();
    next[0].cards[0] = { ...next[0].cards[0], title: "My card renamed" };
    view.update(next);
    expect(screen.getByRole("button", { name: "My card renamed, in Col todo" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Card a, in Col todo" })).toBeNull();
  });

  it("shows the new column after a move", async () => {
    const view = await withResults();
    const next = board();
    const [moved] = next[0].cards.splice(0, 1);
    next[1].cards.push({ ...moved, column_id: "doing" });
    view.update(next);
    expect(screen.getByRole("button", { name: "Card a, in Col doing" })).toBeVisible();
  });

  it("hides a deleted card, then restores it when the delete is rolled back", async () => {
    const original = board();
    const view = await withResults(original);
    const deleted = board();
    deleted[0].cards = deleted[0].cards.filter((c) => c.id !== "a");
    view.update(deleted);
    expect(screen.queryByRole("button", { name: "Card a, in Col todo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Card b, in Col todo" })).toBeVisible();
    view.update(original);
    expect(screen.getByRole("button", { name: "Card a, in Col todo" })).toBeVisible();
  });

  it("does not show a card that begins to match until the next search", async () => {
    const view = await withResults();
    const next = board();
    next[1].cards[0] = { ...next[1].cards[0], title: "Card d renamed to match" };
    view.update(next);
    expect(screen.queryByRole("button", { name: /Card d renamed/ })).toBeNull();
    vi.mocked(apiGet).mockResolvedValue([hit("a", "Card a"), hit("b", "Card b"), hit("d", "Card d renamed to match", "doing")]);
    await search("card ");
    await search("card x".slice(0, 5)); // same trimmed text sends nothing
    expect(screen.queryByRole("button", { name: /Card d renamed/ })).toBeNull();
    await search("card");
    expect(screen.queryByRole("button", { name: /Card d renamed/ })).toBeNull();
    await search("car");
    expect(screen.getByRole("button", { name: "Card d renamed to match, in Col doing" })).toBeVisible();
  });
});
