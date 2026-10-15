/* Calendar skeleton — mirrors the calendar page: heading with the view
 * pills on the right, then the month grid card (weekday header row plus
 * five week rows of seven cells). */
export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading calendar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-28 animate-pulse rounded-md bg-surface-2" />
          <div className="h-4 w-64 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="flex gap-1.5">
          {[72, 88, 64].map((w, i) => (
            <div key={i} className="h-7 animate-pulse rounded-full bg-surface-2" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <div className="h-5 w-36 animate-pulse rounded bg-surface-2" />
          <div className="flex gap-2">
            <div className="h-7 w-7 animate-pulse rounded-md bg-surface-2" />
            <div className="h-7 w-7 animate-pulse rounded-md bg-surface-2" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <div key={d} className="h-3 w-8 animate-pulse rounded bg-surface-2" />
          ))}
          {Array.from({ length: 35 }, (_, i) => (
            <div
              key={`c-${i}`}
              className="flex min-h-20 flex-col gap-1.5 rounded-md border border-hairline bg-background p-2"
            >
              <div className="h-3 w-5 animate-pulse rounded bg-surface-2" />
              {i % 3 === 0 && <div className="h-4 w-full animate-pulse rounded bg-surface-2" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
