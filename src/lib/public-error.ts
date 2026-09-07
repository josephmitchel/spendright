// An error whose message is safe to show to the user; never construct one
// from a caught error's message. Dependency-free.
// Design: error-message-allow-list.
export class PublicError extends Error {
  status: number;
  code: string;
  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.status = options?.status ?? 500;
    this.code = options?.code ?? 'INTERNAL';
  }
}
