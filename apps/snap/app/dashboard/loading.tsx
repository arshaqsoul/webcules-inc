/* Route-level skeleton (Linear-style) — shown while any dashboard section
 * without its own loading boundary streams in. */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-56 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-72 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
            <div className="mt-3 h-7 w-12 animate-pulse rounded-md bg-surface-2" />
            <div className="mt-3 h-3 w-28 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-[12px] border border-hairline bg-surface-1" />
    </div>
  );
}
