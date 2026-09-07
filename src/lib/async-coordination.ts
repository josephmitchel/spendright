// Async coordination primitives. Dependency-free — shared by server modules
// and client hooks.

// Chains `task` onto `key`'s tail: at most one task per key in flight,
// settling in submission order; the returned promise is the task's own, so a
// rejection reaches the caller, never the chain.
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
