/* Mirrors the integrations panel: token cards with name/prefix header,
 * scope chips and created/last-used lines. */
import { SkeletonCard, SkeletonCardTitle, SkeletonLine } from "../_skeletons";

export default function IntegrationsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading integrations">
      {[0, 1].map((c) => (
        <SkeletonCard key={c}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SkeletonCardTitle className="w-40" />
            <SkeletonLine className="w-20" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[72, 88, 56, 80, 64].map((w, i) => (
              <div key={i} className="h-5 animate-pulse rounded-full bg-surface-2" style={{ width: w }} />
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <SkeletonLine className="w-48" />
            <SkeletonLine className="w-40" />
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}
