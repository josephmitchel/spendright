// Plaid sign convention: positive = outflow, negative = inflow (payment,
// refund, reward). Zero and NaN count as spend. Every layer classifies through
// this helper. Design: category-kind-sign-rule.
// Dependency-free — bundled into client code.

// The two category kinds the sign decides between: spend rows take a card
// category, inflow rows a credit category. Lives here, not in the db-backed
// category module, so client components never import from the server graph
// for it. Design: category-kind-sign-rule.
export type CategoryKind = 'card' | 'credit';
export function isInflowAmount(amount: string | number): boolean {
  return Number(amount) < 0;
}
