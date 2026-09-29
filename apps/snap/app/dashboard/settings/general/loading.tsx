/* Mirrors settings-general: one profile card — title, 2-col field grid
 * (4 fields), footer save row. */
import { SkeletonCard, SkeletonCardTitle, SkeletonFields } from "../_skeletons";

export default function GeneralLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading general settings">
      <SkeletonCard>
        <SkeletonCardTitle />
        <SkeletonFields rows={4} />
        <div className="mt-4 flex justify-end">
          <div className="h-8 w-40 animate-pulse rounded-md bg-surface-2" />
        </div>
      </SkeletonCard>
    </div>
  );
}
