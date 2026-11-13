import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import { CreateBoardForm } from "./CreateBoardForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const BRAVO_ID = "33333333-3333-4333-8333-333333333333";
const BRAVO = { id: BRAVO_ID, name: "Bravo", role: "admin", position_version: 0 };

beforeEach(() => {
  push.mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(notifyError).mockReset();
});

async function typeName(value: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Board name"), value);
  return user;
}

describe("CreateBoardForm success", () => {
  it("sends the trimmed name to E06 through the same-origin route", async () => {
    vi.mocked(apiRequest).mockResolvedValue(BRAVO);
    const onCreated = vi.fn();
    render(<CreateBoardForm onCreated={onCreated} />);
    const user = await typeName("  Bravo  ");
    await user.click(screen.getByRole("button", { name: "Create board" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/boards", { name: "Bravo" });
  });

  it("passes the server board to onCreated and opens /boards/{id}", async () => {
    vi.mocked(apiRequest).mockResolvedValue(BRAVO);
    const onCreated = vi.fn();
    render(<CreateBoardForm onCreated={onCreated} />);
    const user = await typeName("Bravo");
    await user.click(screen.getByRole("button", { name: "Create board" }));
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith(`/boards/${BRAVO_ID}`));
    expect(onCreated).toHaveBeenCalledExactlyOnceWith(BRAVO);
  });
});

describe("CreateBoardForm client validation", () => {
  it("shows the name message and sends nothing for a blank name", async () => {
    render(<CreateBoardForm onCreated={vi.fn()} />);
    const user = await typeName("   ");
    await user.click(screen.getByRole("button", { name: "Create board" }));
    expect(screen.getByText("Must be 1 to 100 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Board name")).toHaveAttribute("aria-invalid", "true");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("accepts exactly 100 characters and rejects 101", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...BRAVO, name: "a".repeat(100) });
    const { unmount } = render(<CreateBoardForm onCreated={vi.fn()} />);
    const user = await typeName("a".repeat(100));
    await user.click(screen.getByRole("button", { name: "Create board" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    unmount();

    vi.mocked(apiRequest).mockClear();
    render(<CreateBoardForm onCreated={vi.fn()} />);
    const tooLong = await typeName("a".repeat(101));
    await tooLong.click(screen.getByRole("button", { name: "Create board" }));
    expect(screen.getByText("Must be 1 to 100 characters.")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("CreateBoardForm failure", () => {
  it("shows the server field message and keeps the typed name", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Check the submitted fields.",
        fields: { name: "Must be 1 to 100 characters." },
      }),
    );
    const onCreated = vi.fn();
    render(<CreateBoardForm onCreated={onCreated} />);
    const user = await typeName("Bravo");
    await user.click(screen.getByRole("button", { name: "Create board" }));
    expect(await screen.findByText("Must be 1 to 100 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Board name")).toHaveValue("Bravo");
    expect(onCreated).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a toast for a server failure, keeps the name and re-enables the button", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 500, code: "INTERNAL_ERROR", message: "Something went wrong. Try again." }),
    );
    const onCreated = vi.fn();
    render(<CreateBoardForm onCreated={onCreated} />);
    const user = await typeName("Bravo");
    await user.click(screen.getByRole("button", { name: "Create board" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("Something went wrong. Try again."));
    expect(screen.getByLabelText("Board name")).toHaveValue("Bravo");
    expect(screen.getByRole("button", { name: "Create board" })).toBeEnabled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the form-level message for a VALIDATION_ERROR without field details", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "Check the submitted fields." }),
    );
    render(<CreateBoardForm onCreated={vi.fn()} />);
    const user = await typeName("Bravo");
    await user.click(screen.getByRole("button", { name: "Create board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the submitted fields.");
    expect(screen.getByLabelText("Board name")).toHaveValue("Bravo");
  });

  it("is busy and blocks a second submit while E06 is pending", async () => {
    let finish: (value: unknown) => void = () => {};
    vi.mocked(apiRequest).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<CreateBoardForm onCreated={vi.fn()} />);
    const user = await typeName("Bravo");
    await user.click(screen.getByRole("button", { name: "Create board" }));
    const pending = await screen.findByRole("button", { name: "Creating…" });
    expect(pending).toBeDisabled();
    await user.type(screen.getByLabelText("Board name"), "{Enter}");
    expect(apiRequest).toHaveBeenCalledTimes(1);
    finish(BRAVO);
    await waitFor(() => expect(push).toHaveBeenCalled());
  });
});

describe("CreateBoardForm mobile controls", () => {
  it("gives the name input 16 px text and the submit button a 44 px target", () => {
    render(<CreateBoardForm onCreated={vi.fn()} />);
    expect(screen.getByLabelText("Board name")).toHaveClass("text-base", "min-h-11", "min-w-11");
    expect(screen.getByRole("button", { name: "Create board" })).toHaveClass("min-h-11", "min-w-11", "w-full");
  });
});
