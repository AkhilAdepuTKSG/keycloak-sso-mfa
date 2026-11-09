// Per-ID lock for the write path (design doc, layer 2 and failure F2).
//
// In-process is enough for one Resolver replica. With several replicas, swap this
// for a Redis lock (SET key token NX PX <ttl>) or a ClickHouse Keeper ephemeral node;
// the call sites stay the same.

const tails = new Map<string, Promise<void>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => mine);
  tails.set(key, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

let lastVersion = 0;
/** Millisecond version that never repeats or goes backwards within this process. */
export function nextVersion(): number {
  const now = Date.now();
  lastVersion = now > lastVersion ? now : lastVersion + 1;
  return lastVersion;
}
