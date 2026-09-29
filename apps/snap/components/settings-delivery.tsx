"use client";

/* Settings → Delivery (WEB-234/236): rejected-file retention + EXIF/GPS strip
 * policy, plus a display-only RAW Vault status block fed from entitlements
 * (tier RAW policy + the free-tier trial pocket) — no new API. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function SettingsDelivery({
  rejectedRetentionDays: initialDays,
  exifStripDerived: initialStrip,
  rawStatus,
}: {
  rejectedRetentionDays: number;
  exifStripDerived: boolean;
  rawStatus: {
    rawAllowed: boolean;
    /** null = no trial pocket on this tier. */
    rawTrialBytes: number | null;
    rawBytesUsed: number;
    planName: string;
  };
}) {
  const router = useRouter();
  const [retentionDays, setRetentionDays] = useState(String(initialDays));
  const [stripExif, setStripExif] = useState(initialStrip);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/studio/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rejectedPolicy: {
          enabled: Number(retentionDays) > 0,
          ...(Number(retentionDays) > 0 ? { retainDays: Number(retentionDays) } : {}),
        },
        exifStripDerived: stripExif,
      }),
    });
    setBusy(false);
    setStatus(res.ok ? "Delivery settings saved." : "Save failed — try again.");
    if (res.ok) router.refresh();
  }

  const pocketPct =
    rawStatus.rawTrialBytes && rawStatus.rawTrialBytes > 0
      ? Math.min(100, Math.round((rawStatus.rawBytesUsed / rawStatus.rawTrialBytes) * 100))
      : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[15px] font-medium text-ink">File delivery</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="rejectedRetention" className="text-sm text-ink">Rejected files</label>
            <select id="rejectedRetention" className="max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)}>
              <option value="0">Keep forever</option>
              <option value="7">Delete after 7 days</option>
              <option value="14">Delete after 14 days</option>
              <option value="30">Delete after 30 days</option>
              <option value="60">Delete after 60 days</option>
              <option value="90">Delete after 90 days</option>
            </select>
            <p className="text-xs text-ink-tertiary">
              The daily job permanently deletes rejected files past this window. Files in an active client gallery are never auto-deleted.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={stripExif}
                onChange={(e) => setStripExif(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                Strip camera metadata (EXIF/GPS) from thumbnails &amp; previews
                <span className="mt-1 block text-xs font-normal text-ink-tertiary">
                  Thumbnails and previews shown in your dashboard and client galleries are re-encoded in the
                  browser, so they never carry location or camera data — with this on, the server verifies it
                  and rejects any that do. Your original files are stored and downloaded bit-exact, camera
                  metadata included.
                </span>
              </span>
            </label>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          {status && <p className="text-sm text-ink-subtle">{status}</p>}
          <Button onClick={save} disabled={busy} size="sm">Save delivery settings</Button>
        </div>
      </section>

      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[15px] font-medium text-ink">RAW Vault</h2>
        {rawStatus.rawAllowed ? (
          <p className="mt-2 text-sm text-ink-subtle">
            Your {rawStatus.planName} plan stores RAW files in the frozen Vault with no extra configuration —
            RAW bytes in play: {fmtBytes(rawStatus.rawBytesUsed)}. Manage archiving from the{" "}
            <a href="/dashboard/raw-vault" className="text-primary hover:underline">RAW Vault</a>.
          </p>
        ) : rawStatus.rawTrialBytes ? (
          <div className="mt-2">
            <p className="text-sm text-ink-subtle">
              Free plan RAW trial: {fmtBytes(rawStatus.rawBytesUsed)} of {fmtBytes(rawStatus.rawTrialBytes)} RAW
              storage used. Upgrade to Lite or above for unlimited RAW storage and the full Vault.
            </p>
            {pocketPct !== null && (
              <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={pocketPct} aria-valuemin={0} aria-valuemax={100} aria-label="RAW trial pocket used">
                <div className={`h-full ${pocketPct >= 100 ? "bg-warning" : "bg-primary"}`} style={{ width: `${pocketPct}%` }} />
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-subtle">
            Your {rawStatus.planName} plan doesn&apos;t include RAW storage.
          </p>
        )}
      </section>
    </div>
  );
}
