// Dependency-free — bundled into client code.
export function isSyncFailure<Result extends object>(
  result: Result,
): result is Extract<Result, { error: string }> {
  return 'error' in result;
}
