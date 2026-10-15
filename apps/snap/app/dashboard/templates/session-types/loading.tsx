/* Session types skeleton — mirrors the section page: heading, then the
 * session type rows (name, duration/price line, active chip). */
export default function SessionTypesLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading session types">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-36 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-surface-2" />
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((r) => (
            <div key={r} className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-background px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-52 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="h-5 w-14 shrink-0 animate-pulse rounded-full bg-surface-2" />
              <div className="h-7 w-16 shrink-0 animate-pulse rounded-md bg-surface-2" />
            </div>
          ))}
        </div>
        <div className="mt-4 h-8 w-36 animate-pulse rounded-md bg-surface-2" />
      </div>
    </div>
  );
}
