import type { PaginatedDocs, Payload } from "payload";

/**
 * CMS resilience helper (WEB-406).
 *
 * Runs a Payload query and never throws: if the CMS is unreachable (deploy,
 * migration, network blip) the error is logged and `fallback` is served so
 * the calling route can degrade gracefully instead of rendering a raw 500
 * on the public site.
 *
 * Note: never wrap a callback that calls `notFound()` / `redirect()` — those
 * work by throwing and must propagate.
 */
export async function safeCmsQuery<T>(
  payload: Payload,
  label: string,
  query: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await query();
  } catch (error) {
    payload.logger.error({
      err: error,
      message: `CMS query failed (${label}) — serving fallback content`,
    });
    return fallback;
  }
}

/**
 * Empty paginated result for `safeCmsQuery` fallbacks. `totalPages: 1`
 * keeps pagination UI inert instead of broken.
 */
export function emptyPaginatedDocs<T>(): PaginatedDocs<T> {
  return {
    docs: [],
    totalDocs: 0,
    limit: 0,
    totalPages: 1,
    page: 1,
    pagingCounter: 1,
    hasPrevPage: false,
    hasNextPage: false,
    prevPage: null,
    nextPage: null,
  };
}
