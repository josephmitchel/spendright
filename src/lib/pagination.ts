// Shared page bounds for both sides of the boundary. Dependency-free —
// bundled into client code. Design: transactions-paginated.

// The page size the client sends and the API's ?limit= fallback.
export const PAGE_SIZE = 20;

// The API's cap on ?limit=.
export const MAX_PAGE_LIMIT = 1000;
