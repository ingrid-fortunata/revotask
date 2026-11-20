import type { ReactNode } from "react";

export interface BaseBadgeProps {
  children: ReactNode;
  variant?: "primary" | "ghost" | "success";
  className?: string;
}

const VARIANT_CLASS = { primary: "badge-primary", ghost: "badge-ghost", success: "badge-success" } as const;

// `success` marks a done task on My Tasks and nothing else (FE-D6). A caller may let a long label
// wrap with `h-auto whitespace-normal`, because daisyUI's `badge` has a fixed height.
// A badge is a label, not a control, so it has no 44 px target. shrink-0 keeps the role label
// visible when a long board name wraps beside it (FE-S4).
export function BaseBadge({ children, variant = "ghost", className = "" }: BaseBadgeProps) {
  return <span className={`badge ${VARIANT_CLASS[variant]} shrink-0 ${className}`.trim()}>{children}</span>;
}
