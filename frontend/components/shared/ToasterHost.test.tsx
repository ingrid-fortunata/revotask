import { act, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import toast from "react-hot-toast";
import { describe, expect, it } from "vitest";
import { ToasterHost } from "./ToasterHost";

describe("ToasterHost", () => {
  it("keeps a toast inside a narrow screen with a max width of the viewport minus margins", async () => {
    render(<ToasterHost />);
    act(() => {
      toast.error("Could not reach the server.");
    });
    const message = await screen.findByText("Could not reach the server.");
    const bubble = message.closest("[style*='max-width']") as HTMLElement | null;
    expect(bubble?.style.maxWidth).toBe("calc(100vw - 2rem)");
  });
});

describe("root layout", () => {
  const source = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

  it("mounts the toaster once and uses dvh for full height", () => {
    expect(source.match(/<ToasterHost \/>/g)).toHaveLength(1);
    expect(source).toContain("min-h-dvh");
    expect(source).not.toMatch(/min-h-screen|h-screen|100vh/);
  });

  it("does not lock pinch zoom", () => {
    expect(source).not.toMatch(/maximum-?scale|user-?scalable|maximumScale|userScalable/i);
  });
});
