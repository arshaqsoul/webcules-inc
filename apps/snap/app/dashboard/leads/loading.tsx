/* Leads inbox skeleton — toolbar + list rows. */
export default function LeadsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading leads">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-32 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-56 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-4">
        <div className="h-8 w-full max-w-xs animate-pulse rounded-md bg-surface-2" />
        <div className="mt-4 flex flex-col divide-y divide-hairline">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
              <div className="flex-1">
                <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
                <div className="mt-1.5 h-3 w-56 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
