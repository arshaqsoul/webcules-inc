/* Lead detail skeleton — mirrors the lead page: back link, header, then
 * the thread and details cards in the same max-w-2xl shell. */
export default function LeadDetailLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5" aria-busy="true" aria-label="Loading lead">
      <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-44 animate-pulse rounded-md bg-surface-2" />
          <div className="h-4 w-72 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-8 w-20 animate-pulse rounded-md bg-surface-2" />
      </div>
      {[0, 1].map((s) => (
        <div key={s} className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2].map((r) => (
              <div key={r} className="h-12 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
