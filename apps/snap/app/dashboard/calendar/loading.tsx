/* Calendar skeleton — month grid shell + side panel. */
export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading calendar">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-32 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-64 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="h-4 w-6 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-6 animate-pulse rounded bg-surface-2" />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        </div>
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-4">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 flex flex-col gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
