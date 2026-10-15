/* Dashboard overview skeleton — mirrors the home page: heading, the four
 * quick-stat cards, the pipeline status card, then the two-column next
 * sessions / recent activity grid. */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-surface-2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
            <div className="mt-2 h-7 w-16 animate-pulse rounded-md bg-surface-2" />
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="h-4 w-20 animate-pulse rounded bg-surface-2" />
        <div className="mt-3 flex flex-wrap gap-2">
          {[96, 84, 72, 88, 64, 92].map((w, i) => (
            <div key={i} className="h-6 animate-pulse rounded-full bg-surface-2" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((s) => (
          <div key={s} className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
            <div className="mt-3 flex flex-col gap-2">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center justify-between gap-2 rounded-md border border-hairline bg-background p-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="h-3.5 w-32 animate-pulse rounded bg-surface-2" />
                    <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
                  </div>
                  <div className="h-5 w-14 animate-pulse rounded-full bg-surface-2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
