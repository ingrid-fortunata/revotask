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

function renderForm(overrides: { onRenamed?: () => void; onClose?: () => void } = {}) {
  const onRenamed = overrides.onRenamed ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <RenameBoardForm
      boardId={BOARD_ID}
      currentName="Alpha"
      onRenamed={onRenamed}
      onClose={onClose}
    />,
  );
  return { onRenamed, onClose };
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

  it("sends the trimmed name to E08 and passes the server name to onRenamed", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      id: BOARD_ID,
      name: "Bravo",
      role: "admin",
      position_version: 0,
    });
    const { onRenamed, onClose } = renderForm();
    const user = await replaceName("  Bravo  ");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(onRenamed).toHaveBeenCalledExactlyOnceWith("Bravo"));
    expect(apiRequest).toHaveBeenCalledWith("PATCH", `/api/boards/${BOARD_ID}`, { name: "Bravo" });
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the name length message and sends nothing for a blank name", async () => {
    renderForm();
    await replaceName("   ");
    await userEvent.setup().click(screen.getByRole("button", { name: "Save name" }));
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
    const { onRenamed } = renderForm();
    const user = await replaceName("Bravo");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText("Must be 1 to 100 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Board name")).toHaveValue("Bravo");
    expect(onRenamed).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("closes the form and refreshes the route after a 403", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "This request was not allowed." }),
    );
    const { onRenamed, onClose } = renderForm();
    const user = await replaceName("Bravo");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith("This request was not allowed.");
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("shows the access error and navigates to / after a board-access 404", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "That item was not found." }),
    );
    const { onRenamed } = renderForm();
    const user = await replaceName("Bravo");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/"));
    expect(notifyError).toHaveBeenCalledWith(BOARD_ACCESS_MESSAGE);
    expect(onRenamed).not.toHaveBeenCalled();
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
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    await user.type(screen.getByLabelText("Board name"), "{Enter}");
    expect(apiRequest).toHaveBeenCalledTimes(1);
    finish({ id: BOARD_ID, name: "Bravo", role: "admin", position_version: 0 });
  });

  it("gives the name input 16 px text and the buttons 44 px targets", () => {
    renderForm();
    expect(screen.getByLabelText("Board name")).toHaveClass("text-base", "min-h-11", "min-w-11");
    expect(screen.getByRole("button", { name: "Save name" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("min-h-11", "min-w-11");
  });
});
