import 'server-only';

import { globalSingleton } from '@/lib/global-singleton';
import { logFatalAndExit } from '@/lib/log';

// A rejection or exception escaping every handler would kill the process — and
// the in-process sync scheduler with it — silently. Exit loudly instead; the
// scripts/start.mjs supervisor restarts the server.
// Design: process-crash-backstop.
export function installProcessBackstop(): void {
  globalSingleton('processBackstop', () => {
    process.on('unhandledRejection', (reason) => {
      logFatalAndExit('FATAL: unhandled promise rejection —', reason);
    });
    process.on('uncaughtException', (err) => {
      logFatalAndExit('FATAL: uncaught exception —', err);
    });
    return true;
  });
}
