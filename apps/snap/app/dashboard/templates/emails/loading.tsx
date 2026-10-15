/* Emails skeleton — mirrors the emails page: heading with the intro
 * paragraph, then the saved replies / automatic emails card. */
export default function EmailsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading email templates">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-24 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-64 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-background px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="h-4 w-44 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-64 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="h-7 w-20 shrink-0 animate-pulse rounded-md bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
