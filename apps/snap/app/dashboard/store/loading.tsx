/* /dashboard/store loading (WEB-277, WEB-175 handoff): spinner + copy +
 * skeleton rows. The status card is hidden while loading (handoff state
 * matrix); `aria-busy` on the region. Shimmer is disabled under
 * prefers-reduced-motion via globals.css. */
export default function StoreLoading() {
  return (
    <div className="flex flex-col gap-5 py-8" aria-busy="true" role="status">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-hairline border-t-primary" aria-hidden />
        <p className="text-sm font-medium text-ink-subtle">Loading your store…</p>
      </div>
      <div className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border border-hairline bg-surface" />
        ))}
      </div>
    </div>
  );
}
