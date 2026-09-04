// Plaid sign convention: positive = purchase/outflow (adds to the card
// balance), negative = inflow (payment, refund, reward). Zero and NaN count
// as spend-side. Card categories attach to spend rows and credit categories
// to inflow rows; the transactions_category_kind_sign_ck DB constraint
// enforces the same rule, so every layer must classify amounts through this
// helper.
export function isInflowAmount(amount: string | number): boolean {
  return Number(amount) < 0;
}
