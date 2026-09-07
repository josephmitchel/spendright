// Account display labels. Dependency-free — bundled into client code.
// Structural parameters (not AccountRow) so a Plaid AccountBase can be
// adapted at the call site.

export function accountDisplayName(account: {
  name: string | null;
  officialName: string | null;
  accountId: string;
}): string {
  return account.name ?? account.officialName ?? account.accountId;
}

export function accountTypeLabel(account: { type: string | null; subtype: string | null }): string {
  return `${account.type ?? ''}${account.subtype ? ` / ${account.subtype}` : ''}`;
}
