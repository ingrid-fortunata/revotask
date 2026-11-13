import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDragAndDrop } from "./useDragAndDrop";

function dragEvent(): DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { effectAllowed: "", dropEffect: "", setData: vi.fn() },
  } as unknown as DragEvent;
}

function setup(enabled = true) {
  const onDrop = vi.fn();
  const hook = renderHook(({ on }) => useDragAndDrop({ enabled: on, onDrop }), { initialProps: { on: enabled } });
  return { ...hook, onDrop };
}

describe("useDragAndDrop", () => {
  it("makes a card draggable with a stable test id", () => {
    const { result } = setup();
    const props = result.current.cardProps("k1");
    expect(props.draggable).toBe(true);
    expect(props["data-testid"]).toBe("card-k1");
  });

  it("uses stable test ids for the drop targets", () => {
    const { result } = setup();
    expect(result.current.dropProps("c1", "k2")["data-testid"]).toBe("dropzone-c1-before-k2");
    expect(result.current.dropProps("c1", null)["data-testid"]).toBe("dropzone-c1-end");
  });

  it("sets move effect and drag data on start and tracks the dragged card", () => {
    const { result } = setup();
    const event = dragEvent();
    act(() => result.current.cardProps("k1").onDragStart(event));
    expect(event.dataTransfer.effectAllowed).toBe("move");
    expect(event.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "k1");
    expect(result.current.draggedId).toBe("k1");
  });

  it("marks the target under the dragged card and drops with the card, column and anchor", () => {
    const { result, onDrop } = setup();
    act(() => result.current.cardProps("k1").onDragStart(dragEvent()));
    const over = dragEvent();
    act(() => result.current.dropProps("c2", "k9").onDragOver(over));
    expect(over.preventDefault).toHaveBeenCalled();
    expect(result.current.isTarget("c2", "k9")).toBe(true);
    expect(result.current.isTarget("c2", null)).toBe(false);

    act(() => result.current.dropProps("c2", "k9").onDrop(dragEvent()));
    expect(onDrop).toHaveBeenCalledExactlyOnceWith("k1", "c2", "k9");
    expect(result.current.draggedId).toBeNull();
    expect(result.current.target).toBeNull();
  });

  it("drops at the end of a column with a null anchor", () => {
    const { result, onDrop } = setup();
    act(() => result.current.cardProps("k1").onDragStart(dragEvent()));
    act(() => result.current.dropProps("c2", null).onDrop(dragEvent()));
    expect(onDrop).toHaveBeenCalledExactlyOnceWith("k1", "c2", null);
  });

  it("does nothing when a card is dropped on itself", () => {
    const { result, onDrop } = setup();
    act(() => result.current.cardProps("k1").onDragStart(dragEvent()));
    act(() => result.current.dropProps("c1", "k1").onDrop(dragEvent()));
    expect(onDrop).not.toHaveBeenCalled();
    expect(result.current.draggedId).toBeNull();
  });

  it("clears the state when the drag ends without a drop", () => {
    const { result } = setup();
    act(() => result.current.cardProps("k1").onDragStart(dragEvent()));
    act(() => result.current.dropProps("c2", null).onDragOver(dragEvent()));
    act(() => result.current.cardProps("k1").onDragEnd());
    expect(result.current.draggedId).toBeNull();
    expect(result.current.target).toBeNull();
  });

  it("ignores everything while disabled: not draggable, no drop target, no drop", () => {
    const { result, onDrop } = setup(false);
    expect(result.current.cardProps("k1").draggable).toBe(false);
    const start = dragEvent();
    act(() => result.current.cardProps("k1").onDragStart(start));
    expect(start.preventDefault).toHaveBeenCalled();
    expect(result.current.draggedId).toBeNull();
    const over = dragEvent();
    act(() => result.current.dropProps("c2", null).onDragOver(over));
    expect(over.preventDefault).not.toHaveBeenCalled();
    act(() => result.current.dropProps("c2", null).onDrop(dragEvent()));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("does not accept a drop that did not start from a card", () => {
    const { result, onDrop } = setup();
    act(() => result.current.dropProps("c2", null).onDrop(dragEvent()));
    expect(onDrop).not.toHaveBeenCalled();
  });
});
