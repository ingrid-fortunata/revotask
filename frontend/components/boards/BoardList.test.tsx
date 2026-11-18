import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BoardSummary } from "@/lib/types";
import { BoardList } from "./BoardList";

const ALPHA: BoardSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Alpha",
  role: "admin",
  position_version: 0, sprint_start: null, sprint_end: null,
};
const DELTA: BoardSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Delta",
  role: "member",
  position_version: 0, sprint_start: null, sprint_end: null,
};

describe("BoardList", () => {
  it("renders each board name as a link to its board page, in the order given", () => {
    render(<BoardList boards={[ALPHA, DELTA]} />);
    const list = screen.getByRole("list", { name: "Your boards" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("link")).toHaveAttribute("href", `/boards/${ALPHA.id}`);
    expect(within(items[0]).getByRole("link")).toHaveTextContent("Alpha");
    expect(within(items[1]).getByRole("link")).toHaveAttribute("href", `/boards/${DELTA.id}`);
    expect(within(items[1]).getByRole("link")).toHaveTextContent("Delta");
  });

  it("shows an Admin badge with the primary style and a Member badge with the ghost style", () => {
    render(<BoardList boards={[ALPHA, DELTA]} />);
    const adminBadge = screen.getByText("Admin");
    const memberBadge = screen.getByText("Member");
    expect(adminBadge).toHaveClass("badge", "badge-primary");
    expect(memberBadge).toHaveClass("badge", "badge-ghost");
  });

  it("keeps the role badge in the same link as the name", () => {
    render(<BoardList boards={[ALPHA]} />);
    const link = screen.getByRole("link", { name: /Alpha/ });
    expect(within(link).getByText("Admin")).toBeInTheDocument();
  });

  it("gives each link a 44 px tappable area and lets a long name wrap", () => {
    const longName = "Quarterly planning for the platform reliability and onboarding programme";
    render(<BoardList boards={[{ ...ALPHA, name: longName }]} />);
    const link = screen.getByRole("link");
    expect(link).toHaveClass("min-h-11", "min-w-11");
    const name = screen.getByText(longName);
    expect(name).toHaveClass("min-w-0", "break-words");
  });

  it("renders no list items when there are no boards", () => {
    render(<BoardList boards={[]} />);
    expect(screen.getByRole("list", { name: "Your boards" })).toBeEmptyDOMElement();
  });
});
