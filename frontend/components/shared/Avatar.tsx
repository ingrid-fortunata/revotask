export interface AvatarProps {
  name: string;
  /** "dark" is for the ink sidebar and top bar. */
  tone?: "light" | "dark";
}

const TONE_CLASS = { light: "bg-primary/15 text-primary", dark: "bg-white/15 text-white" } as const;

/** First letter of the first and last word, so "Ada Lovelace" gives "AL". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return (first + last).toUpperCase();
}

// Decorative: the name is always written next to it, so screen readers skip it.
export function Avatar({ name, tone = "light" }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${TONE_CLASS[tone]}`}
    >
      {initials(name)}
    </span>
  );
}
