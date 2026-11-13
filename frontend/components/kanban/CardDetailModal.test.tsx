import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth/AuthContext";
import type { NotFoundResolution } from "@/hooks/useCardComments";
import type { WriteResult } from "@/hooks/useKanbanBoard";
import { apiGet, apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import type { Card, Comment } from "@/lib/types";
import { CardDetailModal, type CardDetailModalProps } from "./CardDetailModal";
import { card, MEMBERS } from "./kanbanTestData";
import { CREATED, comment, ME } from "./commentTestData";

// Feature: comments, Properties 11, 14, 15, 16, 17 and 19 at the modal level, and the carried-
// forward behavior of the card edit dialog (design DD9). The browser client is mocked with a small
// fake server, so the tests assert the requests sent and the text shown.

vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn(), apiGet: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));

const ok = <T,>(value: T): WriteResult<T> => ({ ok: true, value });
const escape = (dialog: HTMLElement) => fireEvent(dialog, new Event("cancel", { cancelable: true }));
const apiError = (statusCode: number | null, code: string, fields?: Record<string, string>) =>
  new ApiError({ statusCode, code, message: `m ${code}`, fields });

const edited = card("k1", "c1", 1024, { title: "Fix login", description: "Steps", assignee_id: "u-grace", assignee_name: "Grace" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// An in-memory comment store behind the mocked client. `lostResponses` makes the next POST save the
// comment and then fail like a dropped connection (the lost-response case).
function fakeServer(initial: Comment[]) {
  const store = initial.map((c) => ({ ...c }));
  const state = { next: 100, lostResponses: 0, getFailures: 0, getGate: null as Promise<void> | null };
  vi.mocked(apiGet).mockImplementation(async () => {
    if (state.getGate) await state.getGate;
    if (state.getFailures > 0) {
      state.getFailures -= 1;
      throw apiError(503, "SERVICE_UNAVAILABLE");
    }
    return store.map((c) => ({ ...c }));
  });
  vi.mocked(apiRequest).mockImplementation(async (method, path, body) => {
    const content = (body as { content?: string } | undefined)?.content ?? "";
    if (method === "POST") {
      const created = comment(`c${state.next++}`, { content, created_at: "2026-11-13T11:00:00+00:00", updated_at: "2026-11-13T11:00:00+00:00" });
      store.push(created);
      if (state.lostResponses > 0) {
        state.lostResponses -= 1;
        throw apiError(null, "NETWORK_ERROR");
      }
      return { ...created };
    }
    const id = String(path).split("/").pop()!;
    const index = store.findIndex((c) => c.id === id);
    if (method === "PATCH") {
      store[index] = { ...store[index], content, updated_at: "2026-11-13T12:00:00+00:00" };
      return { ...store[index] };
    }
    const [removed] = store.splice(index, 1);
    return { ...removed };
  });
  return { store, state };
}

const resolveNotFound = vi.fn<() => Promise<NotFoundResolution>>();

function mount(over: Partial<CardDetailModalProps> = {}) {
  const onSave = vi.fn<CardDetailModalProps["onSave"]>().mockResolvedValue(ok(edited as Card));
  const onDelete = vi.fn<CardDetailModalProps["onDelete"]>().mockResolvedValue(ok(5));
  const onClose = vi.fn();
  const element = (card: Card | null) => (
    <AuthProvider user={ME}>
      <CardDetailModal card={card} members={MEMBERS} onSave={onSave} onDelete={onDelete} onClose={onClose} resolveNotFound={resolveNotFound} {...over} />
    </AuthProvider>
  );
  const view = render(element(edited));
  return { ...view, onSave, onDelete, onClose, rerender: (next: Card | null) => view.rerender(element(next)) };
}

const dialog = () => screen.getByRole("dialog", { name: "Card details" });
const posts = () => vi.mocked(apiRequest).mock.calls.filter(([method]) => method === "POST");
const field = () => within(dialog()).getByLabelText("Add a comment");
// A message appears both in the visible text and in the sr-only live region, so count the visible one.
const shown = (text: RegExp) => within(dialog()).getAllByText(text).filter((el) => !el.classList.contains("sr-only"));
const addButton = () => within(dialog()).getByRole("button", { name: "Add comment" });

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiGet).mockReset();
  vi.mocked(notifyError).mockReset();
  resolveNotFound.mockReset();
});

describe("showing the card and its comments", () => {
  it("is named Card details, loads the comments, and shows the edit form first", async () => {
    fakeServer([comment("c1", { content: "first" }), comment("c2", { author_id: "u-omar", author_name: "Omar", content: "second" })]);
    mount();
    expect(screen.getByText("Loading comments…")).toBeInTheDocument();
    expect(await within(dialog()).findByRole("heading", { name: "Comments (2)" })).toBeInTheDocument();
    expect(within(dialog()).getByLabelText("Title")).toHaveValue("Fix login");
    expect(within(dialog()).getByText("first")).toBeInTheDocument();
    const form = within(dialog()).getByRole("form", { name: "Edit card" });
    const comments = within(dialog()).getByRole("heading", { name: /Comments/ });
    expect(form.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows No comments yet. and the add form for an empty card", async () => {
    fakeServer([]);
    mount();
    expect(await within(dialog()).findByText("No comments yet.")).toBeInTheDocument();
    expect(field()).toBeInTheDocument();
  });

  it("shows a Retry control when the comments fail to load, and the edit form stays usable", async () => {
    const { state } = fakeServer([comment("c1")]);
    state.getFailures = 1;
    mount();
    expect(await within(dialog()).findByText("Comments could not be loaded.")).toBeInTheDocument();
    expect(within(dialog()).getByLabelText("Title")).toBeEnabled();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Retry" }));
    expect(await within(dialog()).findByText("Comment c1")).toBeInTheDocument();
  });

  it("closes on Escape and the Close control without a request", async () => {
    fakeServer([]);
    const { onClose } = mount();
    await within(dialog()).findByText("No comments yet.");
    escape(dialog());
    await userEvent.click(within(dialog()).getByRole("button", { name: "Close card details" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("comment actions", () => {
  it("adds a comment at the end with no Edited marker, clears the field, keeps focus and announces it", async () => {
    fakeServer([comment("c1")]);
    mount();
    await within(dialog()).findByText("Comment c1");
    await userEvent.type(field(), "Looks good");
    await userEvent.click(addButton());
    expect(await within(dialog()).findByText("Looks good")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/cards/k1/comments", { content: "Looks good" });
    expect(within(dialog()).queryByText("Edited")).not.toBeInTheDocument(); // Property 16
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
    expect(within(dialog()).getByRole("heading", { name: "Comments (2)" })).toBeInTheDocument();
    expect(within(dialog()).getByText("Comment added.")).toBeInTheDocument(); // the live region
  });

  it("edits the author's own comment and then shows the Edited marker (Property 16)", async () => {
    fakeServer([comment("c1", { content: "Original" })]);
    mount();
    await within(dialog()).findByText("Original");
    await userEvent.click(within(dialog()).getByRole("button", { name: /Edit your comment from/ }));
    await userEvent.clear(within(dialog()).getByLabelText("Edit your comment"));
    await userEvent.type(within(dialog()).getByLabelText("Edit your comment"), "Changed");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Save comment" }));
    expect(await within(dialog()).findByText("Changed")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/comments/c1", { content: "Changed" });
    expect(within(dialog()).getByText("Edited")).toBeInTheDocument();
  });

  it("deletes after confirmation, removes the comment and moves focus to the comment field", async () => {
    fakeServer([comment("c1", { content: "Remove me" }), comment("c2", { content: "Keep me" })]);
    mount();
    await within(dialog()).findByText("Remove me");
    const items = within(dialog()).getAllByRole("listitem");
    await userEvent.click(within(items[0]).getByRole("button", { name: /Delete your comment from/ }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Delete comment?" })).getByRole("button", { name: "Delete comment" }));
    await waitFor(() => expect(within(dialog()).queryByText("Remove me")).not.toBeInTheDocument());
    expect(apiRequest).toHaveBeenCalledWith("DELETE", "/api/comments/c1");
    expect(within(dialog()).getByText("Keep me")).toBeInTheDocument();
    await waitFor(() => expect(field()).toHaveFocus());
  });

  it("Property 11: another user's comment has no Edit or Delete, not even for an admin viewer", async () => {
    fakeServer([comment("c1", { author_id: "u-omar", author_name: "Omar", content: "theirs" })]);
    mount();
    await within(dialog()).findByText("theirs");
    expect(within(dialog()).queryByRole("button", { name: /your comment/ })).not.toBeInTheDocument();
  });

  it("Property 15: shows markup in a comment as literal text", async () => {
    fakeServer([comment("c1", { content: "<img src=x onerror=alert(1)>" })]);
    mount();
    expect(await within(dialog()).findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(dialog().querySelector("img")).toBeNull();
  });

  it("shows the field message for a blank comment and sends nothing", async () => {
    fakeServer([]);
    mount();
    await within(dialog()).findByText("No comments yet.");
    await userEvent.type(field(), "  ");
    await userEvent.click(addButton());
    expect(within(dialog()).getByText("Must be 1 to 2000 characters.")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("Property 14: the card controls wait for a comment write", () => {
  it("disables Save card and Delete card while an add is pending, then enables them", async () => {
    fakeServer([]);
    const reply = deferred<unknown>();
    mount();
    await within(dialog()).findByText("No comments yet.");
    vi.mocked(apiRequest).mockReturnValue(reply.promise);
    await userEvent.type(field(), "Slow one");
    await userEvent.click(addButton());
    expect(within(dialog()).getByRole("button", { name: "Save card" })).toBeDisabled();
    expect(within(dialog()).getByRole("button", { name: "Delete card" })).toBeDisabled();
    await act(async () => {
      reply.resolve(comment("c9", { content: "Slow one" }));
    });
    await waitFor(() => expect(within(dialog()).getByRole("button", { name: "Save card" })).toBeEnabled());
    expect(within(dialog()).getByRole("button", { name: "Delete card" })).toBeEnabled();
  });
});

describe("carried forward from the card edit dialog", () => {
  it("sends only changed fields, closes on success and closes without a request when nothing changed", async () => {
    fakeServer([]);
    const { onSave, onClose } = mount();
    await within(dialog()).findByText("No comments yet.");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Save card" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.selectOptions(within(dialog()).getByLabelText("Assignee"), "Ada");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Save card" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("k1", { assignee_id: "u-ada" });
  });

  it("keeps the form open with the entered values and the message after a 400", async () => {
    fakeServer([]);
    const onSave = vi.fn<CardDetailModalProps["onSave"]>().mockResolvedValue({
      ok: false,
      error: apiError(400, "VALIDATION_ERROR", { assignee_id: "Choose a participant of this board." }),
      handled: false,
    });
    const { onClose } = mount({ onSave });
    await within(dialog()).findByText("No comments yet.");
    await userEvent.type(within(dialog()).getByLabelText("Title"), " v2");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Save card" }));
    expect(within(dialog()).getByText("Choose a participant of this board.")).toBeInTheDocument();
    expect(within(dialog()).getByLabelText("Title")).toHaveValue("Fix login v2");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("asks for confirmation naming the card, and deletes after Confirm", async () => {
    fakeServer([]);
    const { onDelete, onClose } = mount();
    await within(dialog()).findByText("No comments yet.");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Delete card" }));
    const confirm = screen.getByRole("dialog", { name: "Delete card?" });
    expect(within(confirm).getByText(/Fix login/)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete card" }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith("k1");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Property 13: stale responses are ignored", () => {
  it("shows only the new card's comments when the card changes before the first load answers", async () => {
    const first = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(first.promise as Promise<never>);
    const { rerender } = mount();
    expect(screen.getByText("Loading comments…")).toBeInTheDocument();
    vi.mocked(apiGet).mockResolvedValue([comment("c7", { card_id: "k2", content: "Second card" })] as never);
    rerender(card("k2", "c1", 2048, { title: "Other" }));
    expect(await within(dialog()).findByText("Second card")).toBeInTheDocument();
    await act(async () => {
      first.resolve([comment("c1", { content: "First card" })]);
    });
    expect(within(dialog()).queryByText("First card")).not.toBeInTheDocument();
    expect(within(dialog()).getByText("Second card")).toBeInTheDocument();
  });

  it("ignores an add answer that arrives after the modal closed", async () => {
    fakeServer([]);
    const reply = deferred<unknown>();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = mount();
    await within(dialog()).findByText("No comments yet.");
    vi.mocked(apiRequest).mockReturnValue(reply.promise);
    await userEvent.type(field(), "Late");
    await userEvent.click(addButton());
    rerender(null);
    await act(async () => {
      reply.resolve(comment("c5", { content: "Late" }));
    });
    expect(screen.queryByText("Late")).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("Property 19: a comment 404 is resolved by the board refetch", () => {
  it("closes the modal with a toast when the card is gone", async () => {
    fakeServer([]);
    resolveNotFound.mockResolvedValue("card-gone");
    const { onClose } = mount();
    await within(dialog()).findByText("No comments yet.");
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    await userEvent.type(field(), "Hello");
    await userEvent.click(addButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(notifyError).toHaveBeenCalledWith("That card no longer exists.");
  });

  it("reloads the comments and names the missing comment when the card still exists", async () => {
    const { store } = fakeServer([comment("c1", { content: "Mine" })]);
    resolveNotFound.mockResolvedValue("card-present");
    const { onClose } = mount();
    await within(dialog()).findByText("Mine");
    store.length = 0; // the comment was removed elsewhere
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    await userEvent.click(within(dialog()).getByRole("button", { name: /Delete your comment from/ }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Delete comment?" })).getByRole("button", { name: "Delete comment" }));
    expect((await within(dialog()).findAllByText("That comment no longer exists.")).length).toBeGreaterThan(0);
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("That comment no longer exists.");
    expect(within(dialog()).getByText("No comments yet.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a Retry notice when the board refetch fails", async () => {
    fakeServer([comment("c1", { content: "Mine" })]);
    resolveNotFound.mockResolvedValue("unknown");
    mount();
    await within(dialog()).findByText("Mine");
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    await userEvent.type(field(), "x");
    await userEvent.click(addButton());
    expect(await within(dialog()).findByText("Comments could not be refreshed.")).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("Property 17: an uncertain add (N5), the lost-response regression", () => {
  it("keeps the draft and the list, refetches, blocks the retry until the refresh shows the saved comment once, then allows a manual retry", async () => {
    const { state, store } = fakeServer([comment("c1", { content: "Existing" })]);
    mount();
    await within(dialog()).findByText("Existing");

    // The server saves the comment, then the response is lost. The refetch is held open.
    state.lostResponses = 1;
    let release!: () => void;
    state.getGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await userEvent.type(field(), "Saved but lost");
    await userEvent.click(addButton());

    // While E23 is pending: the draft and the current list stay visible, and Add comment is disabled.
    await waitFor(() => expect(shown(/Checking the list/)).toHaveLength(1));
    expect(field()).toHaveValue("Saved but lost");
    expect(within(dialog()).getByText("Existing")).toBeInTheDocument();
    expect(within(dialog()).queryByText("Saved but lost", { selector: "p" })).not.toBeInTheDocument(); // not in the list yet
    expect(addButton()).toBeDisabled();
    expect(posts()).toHaveLength(1);
    expect(store.filter((c) => c.content === "Saved but lost")).toHaveLength(1);

    // The refresh succeeds: the saved comment appears once, the message says it may have been
    // posted, the draft stays, and the retry is enabled. No second POST was sent on its own.
    await act(async () => {
      state.getGate = null;
      release();
    });
    await waitFor(() => expect(shown(/may have been posted/)).toHaveLength(1));
    expect(within(dialog()).getAllByText("Saved but lost", { selector: "p" })).toHaveLength(1);
    expect(field()).toHaveValue("Saved but lost");
    expect(addButton()).toBeEnabled();
    expect(posts()).toHaveLength(1);

    // A manual retry posts again. No text matching hides it, so there are two comments now.
    await userEvent.click(addButton());
    await waitFor(() => expect(posts()).toHaveLength(2));
    await waitFor(() => expect(within(dialog()).getAllByText("Saved but lost", { selector: "p" })).toHaveLength(2));
    expect(store.filter((c) => c.content === "Saved but lost")).toHaveLength(2);
    expect(field()).toHaveValue("");
  });

  it("keeps Add comment disabled when the refetch fails, until Refresh comments succeeds", async () => {
    const { state } = fakeServer([comment("c1", { content: "Existing" })]);
    mount();
    await within(dialog()).findByText("Existing");
    state.lostResponses = 1;
    state.getFailures = 1;
    await userEvent.type(field(), "Maybe");
    await userEvent.click(addButton());
    expect(await within(dialog()).findByRole("button", { name: "Refresh comments" })).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    expect(field()).toHaveValue("Maybe");
    expect(within(dialog()).getByText("Existing")).toBeInTheDocument();
    expect(posts()).toHaveLength(1);

    await userEvent.click(within(dialog()).getByRole("button", { name: "Refresh comments" }));
    await waitFor(() => expect(addButton()).toBeEnabled());
    expect(shown(/may have been posted/)).toHaveLength(1);
    expect(posts()).toHaveLength(1);
  });
});

describe("Property 16: timestamps", () => {
  it("shows no Edited marker on a comment whose timestamps are equal", async () => {
    fakeServer([comment("c1", { created_at: CREATED, updated_at: CREATED })]);
    mount();
    await within(dialog()).findByText("Comment c1");
    expect(within(dialog()).queryByText("Edited")).not.toBeInTheDocument();
  });
});

describe("Escape in the nested confirmation", () => {
  it("closes only the delete-comment confirmation, not the card details dialog", async () => {
    fakeServer([comment("c1", { content: "Mine" })]);
    const { onClose } = mount();
    await within(dialog()).findByText("Mine");
    await userEvent.click(within(dialog()).getByRole("button", { name: /Delete your comment from/ }));
    const confirm = screen.getByRole("dialog", { name: "Delete comment?" });
    escape(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete comment?" })).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("closes only the delete-card confirmation, not the card details dialog", async () => {
    fakeServer([]);
    const { onClose } = mount();
    await within(dialog()).findByText("No comments yet.");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Delete card" }));
    escape(screen.getByRole("dialog", { name: "Delete card?" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete card?" })).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});
