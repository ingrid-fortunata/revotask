import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionRevalidator } from "./SessionRevalidator";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  refresh.mockReset();
});

function pageshow(persisted: boolean) {
  const event = new Event("pageshow") as PageTransitionEvent;
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

describe("SessionRevalidator", () => {
  it("refreshes the server check when a page comes back from the back-forward cache", () => {
    render(<SessionRevalidator />);
    pageshow(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a normal page show", () => {
    render(<SessionRevalidator />);
    pageshow(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("removes its listener on unmount", () => {
    const { unmount } = render(<SessionRevalidator />);
    unmount();
    pageshow(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renders nothing", () => {
    const { container } = render(<SessionRevalidator />);
    expect(container).toBeEmptyDOMElement();
  });
});
