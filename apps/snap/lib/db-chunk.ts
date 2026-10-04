/* D1 allows at most 100 bound variables per query, so any `IN (...)` or
 * multi-row insert over a photo list has to be sliced. (A 500-photo wedding
 * used to fail with "too many SQL variables" at 99+ photos.) */

/** Ids per `IN (...)` slice - leaves headroom for the other bound filters. */
export const ID_CHUNK = 80;

export async function selectInChunks<T>(ids: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(...(await run(ids.slice(i, i + ID_CHUNK))));
  return out;
}

export async function forEachChunk(ids: string[], run: (chunk: string[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < ids.length; i += ID_CHUNK) await run(ids.slice(i, i + ID_CHUNK));
}
