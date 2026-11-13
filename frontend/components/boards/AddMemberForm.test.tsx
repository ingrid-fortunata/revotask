import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD_ACCESS_MESSAGE } from "@/lib/boardErrors";
import { apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import { AddMemberForm } from "./AddMemberForm";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const ADA_ID = "22222222-2222-4222-8222-222222222222";
const ADA = { user_id: ADA_ID, name: "Ada", role: "member" };

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(notifyError).mockReset();
});

function renderForm(onAdded = vi.fn()) {
  render(<AddMemberForm boardId={BOARD_ID} onAdded={onAdded} />);
  return { onAdded };
}

async function submitEmail(value: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Member email"), value);
  await user.click(screen.getByRole("button", { name: "Add member" }));
  return user;
}

describe("AddMemberForm success (E11 201)", () => {
  it("posts the trimmed, lowercased email to the same-origin members route", async () => {
    vi.mocked(apiRequest).mockResolvedValue(ADA);
    renderForm();
    await submitEmail("  Ada@Example.com ");
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith("POST", `/api/boards/${BOARD_ID}/members`, {
      email: "ada@example.com",
    });
  });

  it("passes the server membership to onAdded, clears the email and refreshes the route", async () => {
    vi.mocked(apiRequest).mockResolvedValue(ADA);
    const { onAdded } = renderForm();
    await submitEmail("ada@example.com");
    await waitFor(() => expect(onAdded).toHaveBeenCalledExactlyOnceWith(ADA));
    expect(screen.getByLabelText("Member email")).toHaveValue("");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("is busy and blocks a second submit while E11 is pending", async () => {
    let finish: (value: unknown) => void = () => {};
    vi.mocked(apiRequest).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();
    const user = await submitEmail("ada@example.com");
    expect(await screen.findByRole("button", { name: "Adding…" })).toBeDisabled();
    await user.type(screen.getByLabelText("Member email"), "{Enter}");
    expect(apiRequest).toHaveBeenCalledTimes(1);
    finish(ADA);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe("AddMemberForm client validation", () => {
  it("shows the email format message and sends nothing for a malformed email", async () => {
    renderForm();
    await submitEmail("not-an-email");
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Member email")).toHaveAttribute("aria-invalid", "true");
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("AddMemberForm E11 error mapping (Requirement 4.12)", () => {
  it("shows a 400 field message under the email field and keeps the typed email", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Check the submitted fields.",
        fields: { email: "Enter a valid email address." },
      }),
    );
    const { onAdded } = renderForm();
    await submitEmail("ada@example.com");
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Member email")).toHaveValue("ada@example.com");
    expect(screen.getByLabelText("Member email")).toHaveAttribute("aria-invalid", "true");
    expect(onAdded).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("shows a 409 STATE_CONFLICT message under the email field and keeps the typed email", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 409,
        code: "STATE_CONFLICT",
        message: "That user is already a member of this board.",
      }),
    );
    renderForm();
    await submitEmail("ada@example.com");
    expect(
      await screen.findByText("That user is already a member of this board."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Member email")).toHaveValue("ada@example.com");
    expect(notifyError).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows USER_NOT_FOUND under the email field only, without a toast or navigation", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({
        statusCode: 404,
        code: "USER_NOT_FOUND",
        message: "No registered user has this email.",
      }),
    );
    const { onAdded } = renderForm();
    await submitEmail("nobody@example.com");
    expect(await screen.findByText("No registered user has this email.")).toBeInTheDocument();
    const input = screen.getByLabelText("Member email");
    expect(input).toHaveValue("nobody@example.com");
    expect(input).toHaveAccessibleDescription("No registered user has this email.");
    expect(notifyError).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("treats a 404 without USER_NOT_FOUND as a board-access error and navigates to /", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "That item was not found." }),
    );
    const { onAdded } = renderForm();
    await submitEmail("ada@example.com");
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/"));
    expect(notifyError).toHaveBeenCalledWith(BOARD_ACCESS_MESSAGE);
    expect(screen.queryByText("That item was not found.")).not.toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("shows a 403 as a toast and refreshes the route so the viewer sees the current role", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "This request was not allowed." }),
    );
    renderForm();
    await submitEmail("ada@example.com");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(notifyError).toHaveBeenCalledWith("This request was not allowed.");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("AddMemberForm mobile controls", () => {
  it("gives the email input 16 px text and a 44 px target, and the submit button a 44 px target", () => {
    renderForm();
    expect(screen.getByLabelText("Member email")).toHaveClass("text-base", "min-h-11", "min-w-11");
    expect(screen.getByRole("button", { name: "Add member" })).toHaveClass(
      "min-h-11",
      "min-w-11",
      "w-full",
    );
  });
});
