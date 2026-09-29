/* Settings fallback skeleton — section routes carry their own size-matched
 * skeletons; this one covers the shell during the initial segment load. */
import { SkeletonCard, SkeletonCardTitle, SkeletonFields, SkeletonHeader } from "./_skeletons";

export default function SettingsLoading() {
  return (
    <div className="flex w-full flex-col gap-6" aria-busy="true" aria-label="Loading settings">
      <SkeletonHeader />
      <div className="flex min-w-0 flex-col gap-4">
        <SkeletonCard>
          <SkeletonCardTitle />
          <SkeletonFields rows={4} />
        </SkeletonCard>
      </div>
    </div>
  );
}
