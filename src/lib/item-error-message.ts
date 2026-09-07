// Dependency-free — bundled into client code.
// Design: error-message-allow-list.
import { isPlaidItemError, plaidErrorMessage, type ItemErrorBody } from '@/lib/plaid-errors';

export function itemErrorMessage(error: ItemErrorBody): string {
  const fallback = JSON.stringify(error);
  return isPlaidItemError(error) ? plaidErrorMessage(error, fallback) : error.message || fallback;
}
