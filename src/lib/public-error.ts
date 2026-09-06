// An error whose message is safe to show to the user. Design:
// error-message-allow-list. Never construct one from a caught error's message.
// Dependency-free (no next/server, no db) so the modules that throw it
// (crypto, plaid, db, categories) take no framework dependency for it.
export class PublicError extends Error {
  status: number;
  code: string;
  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.status = options?.status ?? 500;
    this.code = options?.code ?? 'INTERNAL';
  }
}
