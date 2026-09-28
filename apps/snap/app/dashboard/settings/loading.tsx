/* Settings skeleton — mirrors the settings page shell: max-w-5xl header,
 * plan panel, then the form sections with label + field rows. */
export default function SettingsLoading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6" aria-busy="true" aria-label="Loading settings">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-28 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-72 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="h-20 animate-pulse rounded-[12px] border border-hairline bg-surface-1" />
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col gap-2 border-b border-hairline py-4 first:pt-0 last:border-0 last:pb-0">
            <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
            <div className="h-9 w-full animate-pulse rounded-md bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
