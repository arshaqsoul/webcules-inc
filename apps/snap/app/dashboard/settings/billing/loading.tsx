/* Mirrors the plan panel: status chips row, storage bar, and the 2/4-col
 * plan-card grid. */
import { SkeletonCard, SkeletonCardTitle } from "../_skeletons";

export default function BillingLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading billing">
      <SkeletonCard>
        <SkeletonCardTitle />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[64, 52, 44, 88, 72].map((w, i) => (
            <div key={i} className="h-6 animate-pulse rounded-full bg-surface-2" style={{ width: w }} />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex h-32 flex-col gap-2 rounded-[12px] border border-hairline bg-canvas p-3">
              <div className="flex items-baseline justify-between">
                <div className="h-4 w-14 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-10 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
              <div className="mt-auto h-7 w-full animate-pulse rounded-md bg-surface-2" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}
