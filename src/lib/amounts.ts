// Plaid sign convention: positive = outflow, negative = inflow (payment,
// refund, reward). Zero and NaN count as spend. Every layer classifies through
// this helper. Design: category-kind-sign-rule.
export function isInflowAmount(amount: string | number): boolean {
  return Number(amount) < 0;
}
