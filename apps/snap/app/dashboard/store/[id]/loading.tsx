/* Price list editor skeleton — mirrors the editor shell: heading row with
 * actions, then the products/variants table card. */
export default function PriceListLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading price list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-44 animate-pulse rounded-md bg-surface-2" />
          <div className="h-4 w-64 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-28 animate-pulse rounded-md bg-surface-2" />
          <div className="h-8 w-36 animate-pulse rounded-md bg-surface-2" />
        </div>
      </div>
      <section className="overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
          <div className="ml-auto h-6 w-32 animate-pulse rounded-full bg-surface-2" />
        </div>
        <div className="divide-y divide-hairline">
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="flex items-center gap-4 px-4 py-3">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-surface-2" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="h-4 w-36 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
              <div className="h-5 w-14 animate-pulse rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
