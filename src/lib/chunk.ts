// Keeps id-list queries under Postgres's 65,535 bind-parameter cap; matches
// UPSERT_CHUNK_SIZE so there is one number to reason about.
export const ID_CHUNK_SIZE = 500;

export function chunkArray<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}
