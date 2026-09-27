/* RAW vault skeleton — mirrors the vault page: header, three summary
 * stat cards, then the vault table card. */
export default function RawVaultLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading RAW vault">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-28 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-72 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
            <div className="mt-3 h-7 w-14 animate-pulse rounded-md bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
