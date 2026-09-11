// The one number keeping every bulk query — id-list deletes/locks and
// multi-row upserts alike — under Postgres's 65,535 bind-parameter cap.
export const DB_CHUNK_SIZE = 500;

export function chunkArray<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}
