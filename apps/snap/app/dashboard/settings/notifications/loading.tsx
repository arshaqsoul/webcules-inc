/* Mirrors the notifications panel: grouped toggle rows (label + switch)
 * stacked in a card. */
import { SkeletonCard, SkeletonCardTitle, SkeletonLine } from "../_skeletons";

export default function NotificationsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading notifications">
      {[0, 1].map((c) => (
        <SkeletonCard key={c}>
          <SkeletonCardTitle className="w-44" />
          <div className="mt-4 flex flex-col divide-y divide-hairline">
            {[0, 1, 2].map((r) => (
              <div key={r} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-1.5">
                  <SkeletonLine className="w-40" />
                  <SkeletonLine className="w-56" />
                </div>
                <div className="h-5 w-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}
