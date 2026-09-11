// The bundler emits separate copies of a module per import graph
// (Verified-on: next@16.3.4), so cross-copy singletons go through globalThis.
const globalStore = globalThis as unknown as {
  __spendrightSingletons?: Map<string, unknown>;
};

// Closed key set: a typo'd or undeclared key is a compile error instead of a
// silently type-punned collision.
export type SingletonKey =
  | 'pool'
  | 'lockPool'
  | 'db'
  | 'plaidClient'
  | 'processBackstop'
  | 'syncItemTails'
  | 'syncAllInFlight'
  | 'syncScheduler'
  | 'syncStatus';

export function globalSingleton<T>(key: SingletonKey, create: () => T): T {
  const singletons = (globalStore.__spendrightSingletons ??= new Map<string, unknown>());
  if (!singletons.has(key)) singletons.set(key, create());
  return singletons.get(key) as T;
}
