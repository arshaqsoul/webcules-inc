/* Leads skeleton — mirrors the leads page: heading with the search row,
 * the status filter pills, then the leads table (name, shoot, event date,
 * status, received). */
export default function LeadsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading leads">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-20 animate-pulse rounded-md bg-surface-2" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-surface-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-56 animate-pulse rounded-md bg-surface-2" />
          <div className="h-9 w-20 animate-pulse rounded-md bg-surface-2" />
        </div>
      </div>
      <div className="flex gap-1.5">
        {[64, 80, 56, 72].map((w, i) => (
          <div key={i} className="h-7 animate-pulse rounded-full bg-surface-2" style={{ width: w }} />
        ))}
      </div>
      <section className="overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
        <div className="flex gap-6 border-b border-hairline px-4 py-3">
          <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="divide-y divide-hairline">
          {[0, 1, 2, 3, 4].map((r) => (
            <div key={r} className="flex items-center gap-6 px-4 py-3">
              <div className="flex flex-col gap-1.5">
                <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-44 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-20 animate-pulse rounded bg-surface-2" />
              <div className="ml-auto h-5 w-16 animate-pulse rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
