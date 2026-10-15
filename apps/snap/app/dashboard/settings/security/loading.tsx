/* Mirrors the security panel: sessions table card and password/action
 * rows. */
import { SkeletonCard, SkeletonCardTitle, SkeletonLine } from "../_skeletons";

export default function SecurityLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading security">
      <SkeletonCard>
        <SkeletonCardTitle className="w-28" />
        <div className="mt-4 flex flex-col gap-2">
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-2/3" />
        </div>
        <div className="mt-4 h-8 w-36 animate-pulse rounded-md bg-surface-2" />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonCardTitle className="w-36" />
        <div className="mt-4 flex flex-col divide-y divide-hairline">
          {[0, 1, 2].map((r) => (
            <div key={r} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <SkeletonLine className="w-52" />
              <div className="h-7 w-20 shrink-0 animate-pulse rounded-md bg-surface-2" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}
