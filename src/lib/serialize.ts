// Async coordination helpers, dependency-free so server modules and client
// hooks share one implementation of each idiom instead of hand-rolling it.

// Chains `task` onto `key`'s tail: at most one task per key is in flight, and
// tasks settle strictly in submission order. The map entry self-cleans once
// the finished tail is still the newest (identity-checked, so a chain that
// grew in the meantime keeps its tail). The returned promise is the task's
// own — a rejection reaches the caller, never the chain.
export function serializeByKey<T>(
  tails: Map<string, Promise<void>>,
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}

// Single-flight: a caller that arrives while `slot.inFlight` is set joins
// that run instead of starting a duplicate. The slot lives with the caller so
// its lifetime (usually a process-wide singleton) stays the caller's choice.
export function singleFlight<T>(
  slot: { inFlight: Promise<T> | null },
  run: () => Promise<T>,
): Promise<T> {
  if (!slot.inFlight) {
    slot.inFlight = run().finally(() => {
      slot.inFlight = null;
    });
  }
  return slot.inFlight;
}
