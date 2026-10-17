/* Settings fallback skeleton — section routes carry their own size-matched
 * skeletons; this one covers the shell during the initial segment load. The
 * real Settings heading comes from settings/layout.tsx, so none is drawn
 * here (a skeleton heading under the real one read as two layers). */
import { SkeletonCard, SkeletonCardTitle, SkeletonFields } from "./_skeletons";

export default function SettingsLoading() {
  return (
    <div className="flex w-full flex-col gap-4" aria-busy="true" aria-label="Loading settings">
      <SkeletonCard>
        <SkeletonCardTitle />
        <SkeletonFields rows={4} />
      </SkeletonCard>
    </div>
  );
}
