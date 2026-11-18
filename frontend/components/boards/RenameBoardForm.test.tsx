import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiClient";
import { BOARD_ACCESS_MESSAGE } from "@/lib/boardErrors";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import { RenameBoardForm } from "./RenameBoardForm";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const BOARD_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(notifyError).mockReset();
});

const NO_SPRINT = { sprint_start: null, sprint_end: null };
const A_SPRINT = { sprint_start: "2026-11-16", sprint_end: "2026-11-22" };

function renderForm(
  overrides: { onSaved?: () => void; onClose?: () => void; sprint?: typeof NO_SPRINT | typeof A_SPRINT } = {},
) {
  const onSaved = overrides.onSaved ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <RenameBoardForm
      boardId={BOARD_ID}
      currentName="Alpha"
      currentSprint={overrides.sprint ?? NO_SPRINT}
      onSaved={onSaved}
      onClose={onClose}
    />,
  );
  return { onSaved, onClose };
}

async function replaceName(value: string) {
  const user = userEvent.setup();
  const input = screen.getByLabelText("Board name");
  await user.clear(input);
  await user.type(input, value);
  return user;
}

describe("RenameBoardForm", () => {
  it("prefills the current name and focuses the input on open", () => {
    renderForm();
    const input = screen.getByLabelText("Board name");
    expect(input).toHaveValue("Alpha");
    expect(input).toHaveFocus();
  });

  it("sends the trimmed name to E08 and passes the server name and sprint to onSaved", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      id: BOARD_ID,
      name: "Bravo",
      role: "admin",
      position_version: 0,
      sprint_start: null,
      sprint_end: null,
    });
    const { onSaved, onClose } = renderForm();
    const user = await replaceName("  Bravo  ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledExactlyOnceWith({ name: "Bravo", sprint_start: null, sprint_end: null }),
    );
    expect(apiRequest).toHaveBeenCalledWith("PATCH", `/api/boards/${BOARD_ID}`, { name: "Bravo" });
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the name length message and sends nothing for a blank name", async () => {
    renderForm();
    await replaceName("   ");
    await userEvent.setup().click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Must be 1 to 100 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Board name")).toHaveAttribute("aria-invalid", "true");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("shows a 400 field message under the name input and keeps the typed name", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Check the submitted fields.",
        fields: { name: "Must be 1 to 100 characters." },
      }),
    );
    const { onSaved } = renderForm();
    const user = await replaceName("Bravo");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Must be 1 to 100 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Board name")).toHaveValue("Bravo");
    expect(onSaved).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("closes the form and refreshes the route after a 403", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "This request was not allowed." }),
    );
    const { onSaved, onClose } = renderForm();
    const user = await replaceName("Bravo");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith("This request was not allowed.");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows the access error and navigates to / after a board-access 404", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "That item was not found." }),
    );
    const { onSaved } = renderForm();
    const user = await replaceName("Bravo");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/"));
    expect(notifyError).toHaveBeenCalledWith(BOARD_ACCESS_MESSAGE);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("calls onClose on Cancel without calling the API", async () => {
    const { onClose } = renderForm();
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("shows a pending label and blocks a second submit while E08 runs", async () => {
    let finish: (value: unknown) => void = () => {};
    vi.mocked(apiRequest).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();
    const user = await replaceName("Bravo");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    await user.type(screen.getByLabelText("Board name"), "{Enter}");
    expect(apiRequest).toHaveBeenCalledTimes(1);
    finish({ id: BOARD_ID, name: "Bravo", role: "admin", position_version: 0, sprint_start: null, sprint_end: null });
  });

  it("gives the name input 16 px text and the buttons 44 px targets", () => {
    renderForm();
    expect(screen.getByLabelText("Board name")).toHaveClass("text-base", "min-h-11", "min-w-11");
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("min-h-11", "min-w-11");
  });
});

// Revision 2 (Requirement 8.7, 8.13): the sprint dates beside the name.
describe("RenameBoardForm sprint dates", () => {
  const reply = (extra: object = {}) => ({
    id: BOARD_ID,
    name: "Alpha",
    role: "admin",
    position_version: 0,
    ...NO_SPRINT,
    ...extra,
  });

  it("is an Edit board form with the dates prefilled from the board", () => {
    renderForm({ sprint: A_SPRINT });
    expect(screen.getByRole("form", { name: "Edit board" })).toBeInTheDocument();
    expect(screen.getByLabelText("Sprint start")).toHaveValue("2026-11-16");
    expect(screen.getByLabelText("Sprint end")).toHaveValue("2026-11-22");
  });

  it("starts with empty dates and no Clear dates button when the board has no sprint", () => {
    renderForm();
    expect(screen.getByLabelText("Sprint start")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear dates" })).not.toBeInTheDocument();
  });

  it("sends the unchanged pair with the name when the board has a sprint", async () => {
    vi.mocked(apiRequest).mockResolvedValue(reply(A_SPRINT));
    renderForm({ sprint: A_SPRINT });
    await userEvent.setup().click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith("PATCH", `/api/boards/${BOARD_ID}`, { name: "Alpha", ...A_SPRINT });
  });

  it("sends a new pair, and passes the saved sprint to onSaved", async () => {
    vi.mocked(apiRequest).mockResolvedValue(reply({ sprint_start: "2026-12-01", sprint_end: "2026-12-07" }));
    const { onSaved } = renderForm();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Sprint start"), "2026-12-01");
    await user.type(screen.getByLabelText("Sprint end"), "2026-12-07");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledExactlyOnceWith({
        name: "Alpha",
        sprint_start: "2026-12-01",
        sprint_end: "2026-12-07",
      }),
    );
    expect(apiRequest).toHaveBeenCalledWith("PATCH", `/api/boards/${BOARD_ID}`, {
      name: "Alpha",
      sprint_start: "2026-12-01",
      sprint_end: "2026-12-07",
    });
  });

  it("clears an existing sprint with two nulls after Clear dates", async () => {
    vi.mocked(apiRequest).mockResolvedValue(reply());
    const { onSaved } = renderForm({ sprint: A_SPRINT });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Clear dates" }));
    expect(screen.getByLabelText("Sprint start")).toHaveValue("");
    expect(screen.getByLabelText("Sprint end")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear dates" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ name: "Alpha", ...NO_SPRINT }));
    expect(apiRequest).toHaveBeenCalledWith("PATCH", `/api/boards/${BOARD_ID}`, { name: "Alpha", ...NO_SPRINT });
  });

  it("sends no sprint key when the board had none and none is entered", async () => {
    vi.mocked(apiRequest).mockResolvedValue(reply({ name: "Bravo" }));
    renderForm();
    const user = await replaceName("Bravo");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith("PATCH", `/api/boards/${BOARD_ID}`, { name: "Bravo" });
  });

  it.each([
    ["one date only", "2026-12-01", "", "Sprint end", "Enter both sprint dates."],
    ["an end before the start", "2026-12-07", "2026-12-01", "Sprint end", "Must be on or after the start date."],
  ])("blocks the request for %s and focuses the field", async (_label, start, end, field, message) => {
    renderForm();
    const user = userEvent.setup();
    if (start) await user.type(screen.getByLabelText("Sprint start"), start);
    if (end) await user.type(screen.getByLabelText("Sprint end"), end);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText(field)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(field)).toHaveFocus();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("shows a server sprint error next to the date, keeps every value and focuses it", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Check the submitted fields.",
        fields: { sprint_end: "Must be at most 90 days long." },
      }),
    );
    const { onSaved } = renderForm({ sprint: A_SPRINT });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Must be at most 90 days long.")).toBeInTheDocument();
    expect(screen.getByLabelText("Sprint end")).toHaveFocus();
    expect(screen.getByLabelText("Board name")).toHaveValue("Alpha");
    expect(screen.getByLabelText("Sprint start")).toHaveValue("2026-11-16");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("gives the date inputs 16 px text and 44 px targets and Clear dates a 44 px target", () => {
    renderForm({ sprint: A_SPRINT });
    for (const label of ["Sprint start", "Sprint end"]) {
      expect(screen.getByLabelText(label)).toHaveClass("text-base", "min-h-11", "min-w-11");
    }
    expect(screen.getByRole("button", { name: "Clear dates" })).toHaveClass("min-h-11", "min-w-11");
  });
});
