/* Mirrors settings-brand: card with accent/font/theme fields and the
 * logo + save footer (the advanced preview iframe is collapsed by default,
 * so the resting height is the field grid + footer). */
import { SkeletonCard, SkeletonCardTitle, SkeletonFields } from "../_skeletons";

export default function BrandLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading brand settings">
      <SkeletonCard>
        <SkeletonCardTitle />
        <SkeletonFields rows={2} />
        <div className="mt-3 h-3 w-56 animate-pulse rounded bg-surface-2" />
        <div className="mt-4 flex items-center justify-between">
          <div className="h-9 w-36 animate-pulse rounded bg-surface-2" />
          <div className="h-8 w-28 animate-pulse rounded-md bg-surface-2" />
        </div>
      </SkeletonCard>
    </div>
  );
}
