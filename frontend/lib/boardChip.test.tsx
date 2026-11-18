import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardList } from "@/components/boards/BoardList";
import { chipClass } from "./boardChip";

describe("chipClass", () => {
  it("gives one of six fixed classes and the same class for the same ID", () => {
    const ids = Array.from({ length: 40 }, (_, n) => `board-${n}`);
    const classes = new Set(ids.map(chipClass));
    expect(classes.size).toBeLessThanOrEqual(6);
    expect(classes.size).toBeGreaterThan(1);
    for (const id of ids) expect(chipClass(id)).toBe(chipClass(id));
  });

  it("is the class BoardList puts on a board's chip", () => {
    const id = "b0000000-0000-4000-8000-000000000001";
    const { container } = render(<BoardList boards={[{ id, name: "Alpha", role: "admin", position_version: 0, sprint_start: null, sprint_end: null }]} />);
    expect(container.querySelector(`.${chipClass(id)}`)).not.toBeNull();
  });
});
