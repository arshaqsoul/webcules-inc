/* Mirrors settings-delivery: file-delivery card (retention select, EXIF
 * toggle paragraph) + the RAW Vault status card. */
import { SkeletonCard, SkeletonCardTitle, SkeletonLine } from "../_skeletons";

export default function DeliveryLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading delivery settings">
      <SkeletonCard>
        <SkeletonCardTitle />
        <div className="mt-4 flex flex-col gap-2">
          <SkeletonLine className="w-24" />
          <div className="h-9 w-full max-w-xs animate-pulse rounded-md bg-surface-2" />
        </div>
        <div className="mt-4 flex items-start gap-2">
          <div className="mt-0.5 h-4 w-4 shrink-0 animate-pulse rounded bg-surface-2" />
          <div className="flex w-full flex-col gap-2">
            <SkeletonLine className="w-3/4" />
            <SkeletonLine className="w-full" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <div className="h-8 w-40 animate-pulse rounded-md bg-surface-2" />
        </div>
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonCardTitle />
        <div className="mt-2 flex flex-col gap-2">
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-2/3" />
        </div>
      </SkeletonCard>
    </div>
  );
}
