// Six chip colors, all 4.5:1 or better against white text. The same board always gets the same
// color, so a user finds it by color as well as by name (FE-D6). Shared by the dashboard and
// the My Tasks groups.
const CHIP_CLASS = [
  "bg-teal-700",
  "bg-sky-700",
  "bg-indigo-700",
  "bg-rose-700",
  "bg-amber-700",
  "bg-emerald-700",
] as const;

export function chipClass(id: string): string {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return CHIP_CLASS[sum % CHIP_CLASS.length];
}
