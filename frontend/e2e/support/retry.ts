// One bounded retry for an unexpected 429 during setup (design 4). Test bodies never use it: an
// intentional rate-limit assertion must read the first response directly.

const DEFAULT_WAIT_S = 60;
const MAX_WAIT_S = 70;

/** Seconds to wait from a Retry-After header. A missing or non-numeric value uses 60 s, capped at 70 s. */
export function retryAfterSeconds(header: string | null): number {
  const value = header === null ? Number.NaN : Number(header.trim());
  if (!Number.isFinite(value) || value < 0) return DEFAULT_WAIT_S;
  return Math.min(Math.max(1, Math.ceil(value)), MAX_WAIT_S);
}

export type Reply = { status: number; headers: { get(name: string): string | null } };

export async function sendWithSetupRetry<R extends Reply>(
  endpoint: string,
  send: () => Promise<R>,
  opts: { sleep?: (ms: number) => Promise<void>; log?: (line: string) => void } = {},
): Promise<R> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log = opts.log ?? ((line: string) => console.log(line));
  const first = await send();
  if (first.status !== 429) return first;
  const wait = retryAfterSeconds(first.headers.get("retry-after"));
  log(`rate limited on ${endpoint}, retry after ${wait} s`);
  await sleep(wait * 1000);
  const second = await send();
  if (second.status === 429) throw new Error(`rate limited twice on ${endpoint}; run stopped`);
  return second;
}
