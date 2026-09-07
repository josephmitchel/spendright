// One value per process, keyed by name. The bundler emits separate copies of
// a module per import graph (Verified-on: next@16.3.4) and dev HMR reloads
// modules, so cross-copy singletons go through globalThis.
// Design: scheduled-sync.
const globalStore = globalThis as unknown as {
  __spendrightSingletons?: Map<string, unknown>;
};

export function globalSingleton<T>(key: string, create: () => T): T {
  const singletons = (globalStore.__spendrightSingletons ??= new Map<string, unknown>());
  if (!singletons.has(key)) singletons.set(key, create());
  return singletons.get(key) as T;
}
