// One value per process, keyed by name. Module-scope state is not
// once-per-process here: the bundler emits separate copies of a module per
// import graph (verified in the compiled chunks), and dev HMR reloads
// modules, so every cross-copy singleton goes through globalThis. This
// helper is the one place that holds the cast and that rationale.
// Design: scheduled-sync.
const globalStore = globalThis as unknown as {
  __spendrightSingletons?: Map<string, unknown>;
};

export function globalSingleton<T>(key: string, create: () => T): T {
  const singletons = (globalStore.__spendrightSingletons ??= new Map<string, unknown>());
  if (!singletons.has(key)) singletons.set(key, create());
  return singletons.get(key) as T;
}
