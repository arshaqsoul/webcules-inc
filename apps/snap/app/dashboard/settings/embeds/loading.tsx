/* Mirrors settings-embeds: the embed hub card (title + three snippet
 * blocks) and the allowed-origins card with its textarea + save row. */
import { SkeletonCard, SkeletonCardTitle } from "../_skeletons";

export default function EmbedsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading embeds">
      <SkeletonCard>
        <SkeletonCardTitle />
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonCardTitle />
        <div className="mt-3 h-[72px] w-full animate-pulse rounded-md bg-surface-2" />
        <div className="mt-3 flex justify-end">
          <div className="h-8 w-28 animate-pulse rounded-md bg-surface-2" />
        </div>
      </SkeletonCard>
    </div>
  );
}
