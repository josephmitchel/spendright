// Discriminates a per-item sync-all result: a failure carries `error`, a
// finished sync does not (SyncAllResult has no tag field). Dependency-free —
// bundled into client code.
export function isSyncFailure<Result extends object>(
  result: Result,
): result is Extract<Result, { error: string }> {
  return 'error' in result;
}
