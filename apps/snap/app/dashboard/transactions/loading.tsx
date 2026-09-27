/* Transactions skeleton — mirrors the ledger table: 5 columns (date,
 * project, type, right-aligned amount, status chip) in the same card. */
export default function TransactionsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading transactions">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-64 animate-pulse rounded bg-surface-2" />
      </div>
      <section className="overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
        <div className="flex gap-4 border-b border-hairline px-4 py-3">
          <div className="h-3 w-10 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-14 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-10 animate-pulse rounded bg-surface-2" />
          <div className="ml-auto h-3 w-12 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="divide-y divide-hairline">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-14 animate-pulse rounded bg-surface-2" />
              <div className="ml-auto h-4 w-14 animate-pulse rounded bg-surface-2" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
