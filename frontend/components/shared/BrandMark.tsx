export interface BrandMarkProps {
  className?: string;
}

// Three columns of different heights: the Kanban board in one glyph. Decorative, the name beside it
// is the label.
export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2 text-lg font-bold tracking-tight ${className}`.trim()}>
      <svg viewBox="0 0 24 24" className="size-7 shrink-0" aria-hidden="true">
        <rect width="24" height="24" rx="6" className="fill-primary" />
        <rect x="5" y="6" width="3.5" height="12" rx="1" fill="#fff" />
        <rect x="10.25" y="6" width="3.5" height="8" rx="1" fill="#fff" />
        <rect x="15.5" y="6" width="3.5" height="10" rx="1" fill="#fff" />
      </svg>
      <span>RevoTask</span>
    </span>
  );
}
