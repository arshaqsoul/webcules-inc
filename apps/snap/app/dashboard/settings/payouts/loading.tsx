/* Mirrors the payouts panel: connect status card with action button row. */
import { SkeletonCard, SkeletonCardTitle, SkeletonLine } from "../_skeletons";

export default function PayoutsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading payouts">
      <SkeletonCard>
        <SkeletonCardTitle />
        <div className="mt-2 flex flex-col gap-2">
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-1/2" />
        </div>
        <div className="mt-4">
          <div className="h-9 w-56 animate-pulse rounded-md bg-surface-2" />
        </div>
      </SkeletonCard>
    </div>
  );
}
