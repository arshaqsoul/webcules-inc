/* Mirrors the team panel: member rows (avatar, name + email, role chip)
 * stacked in a card with an invite row on top. */
import { SkeletonCard, SkeletonCardTitle, SkeletonLine } from "../_skeletons";

export default function TeamLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading team">
      <SkeletonCard>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="h-9 flex-1 animate-pulse rounded-md bg-surface-2" />
          <div className="h-8 w-32 animate-pulse rounded-md bg-surface-2 sm:self-end" />
        </div>
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonCardTitle className="w-24" />
        <div className="mt-4 flex flex-col divide-y divide-hairline">
          {[0, 1, 2].map((r) => (
            <div key={r} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-2" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <SkeletonLine className="w-32" />
                <SkeletonLine className="w-48" />
              </div>
              <div className="h-6 w-20 shrink-0 animate-pulse rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}
