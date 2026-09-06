// How an account is identified and labeled everywhere a user sees one.
// Dependency-free — bundled into client code; the server's link-failure
// messages use it too. Structural parameter (not AccountRow) so a Plaid
// AccountBase can be adapted at the call site.

// The display-name fallback chain is a product convention, defined once: a
// nameless account falls back to its official name, then to the raw id.
export function accountDisplayName(account: {
  name: string | null;
  officialName: string | null;
  accountId: string;
}): string {
  return account.name ?? account.officialName ?? account.accountId;
}

// "type / subtype", omitting the separator when subtype is missing.
export function accountTypeLabel(account: { type: string | null; subtype: string | null }): string {
  return `${account.type ?? ''}${account.subtype ? ` / ${account.subtype}` : ''}`;
}
