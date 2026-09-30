import Link from "next/link";

/** Plan-gate card (WEB-286) — when a Templates section is a Lite+ feature
 * and the org is on Free, show the upgrade path instead of an editor that
 * fails on save. Same pattern as the gallery designer's Lite card. */
export function LiteUpsell({ feature, note }: { feature: string; note?: string }) {
  return (
    <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <p className="text-sm font-medium text-ink">{feature} are included with Lite.</p>
      <p className="mt-1 text-sm text-ink-subtle">
        {note ?? "Define them once and reuse them on every project."} Free studios can browse the starters —
        creating and editing your own is part of the Lite plan.
      </p>
      <Link
        href="/dashboard/settings/billing"
        className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-2"
      >
        Upgrade to Lite — $15/mo
      </Link>
    </div>
  );
}
