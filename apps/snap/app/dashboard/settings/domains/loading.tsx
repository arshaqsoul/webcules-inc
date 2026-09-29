/* Mirrors the domains panel's resting shape: header card with slot count +
 * hostname input row; pending studios would stack record rows below. */
import { SkeletonCard, SkeletonCardTitle, SkeletonLine } from "../_skeletons";

export default function DomainsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading domains">
      <SkeletonCard>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SkeletonCardTitle />
          <SkeletonLine className="w-28" />
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="h-9 flex-1 animate-pulse rounded-md bg-surface-2" />
          <div className="h-8 w-36 animate-pulse rounded-md bg-surface-2 sm:self-end" />
        </div>
      </SkeletonCard>
    </div>
  );
}
