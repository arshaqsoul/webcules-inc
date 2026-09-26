"use client";

/* Client gallery panel — share links for this project: create (emails the
 * client), re-send, regenerate (old link dies), revoke, expiry editing. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { useConfirm } from "@/components/confirm-provider";

export type GrantItem = {
  id: string;
  clientEmail: string;
  status: string;
  state: "active" | "expiring_soon" | "expired" | "revoked" | "regenerated";
  expiresAt: string | null;
  createdAt: string;
  assetCount: number;
  allowDownload: boolean;
  views: number;
  downloads: number;
  lastViewedAt: string | null;
};

const STATE_BADGE: Record<GrantItem["state"], string> = {
  active: "bg-primary/10 text-primary",
  expiring_soon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  expired: "bg-surface-2 text-ink-tertiary",
  revoked: "bg-destructive/10 text-destructive",
  regenerated: "bg-surface-2 text-ink-tertiary",
};

const EXPIRY_OPTIONS = [
  { label: "No expiry", value: "" },
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "1 year", value: "365" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ProjectGalleries({
  projectId,
  clientEmail,
  approvedCount,
  grants,
}: {
  projectId: string;
  clientEmail: string;
  approvedCount: number;
  grants: GrantItem[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [email, setEmail] = useState(clientEmail);
  const [days, setDays] = useState("30");
  const [allowDownload, setAllowDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ url: string; emailed: boolean } | null>(null);

  async function createGrant() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientEmail: email, expiresInDays: days ? Number(days) : null, allowDownload }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; emailed?: boolean; error?: string };
      if (!res.ok) {
        setError(
          body.error === "no_assets"
            ? "Approve some files first — a gallery shares your approved set."
            : body.error === "invalid_email"
              ? "Enter a valid client email."
              : "Could not create the link — try again.",
        );
      } else {
        setFlash({ url: body.url ?? "", emailed: Boolean(body.emailed) });
        router.refresh();
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  async function act(grantId: string, action: "revoke" | "regenerate" | "resend") {
    const confirmText =
      action === "revoke"
        ? "Revoke this gallery link? The client loses access immediately."
        : action === "regenerate"
          ? "Create a new link? The old link stops working immediately and the client gets the new one by email."
          : null;
    if (confirmText && !(await confirm({ title: "Are you sure?", body: confirmText, destructive: true }))) return;
    setBusy(true);
    try {
      const res =
        action === "revoke"
          ? await fetch(`/api/grants/${grantId}/revoke`, { method: "POST" })
          : action === "regenerate"
            ? await fetch(`/api/grants/${grantId}/regenerate`, { method: "POST" })
            : await fetch(`/api/grants/${grantId}/email`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { url?: string; emailed?: boolean };
      if (!res.ok && action === "resend") {
        setError("This link is no longer active — regenerate to send a fresh one.");
      } else if (res.ok && action === "regenerate") {
        setFlash({ url: body.url ?? "", emailed: Boolean(body.emailed) });
      }
      router.refresh();
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  async function setExpiry(grantId: string, value: string) {
    setBusy(true);
    await fetch(`/api/grants/${grantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresInDays: value ? Number(value) : null }),
    }).catch(() => null);
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {flash && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium text-ink">
            {flash.emailed ? "Link emailed to the client." : "Link created (email delivery failed — copy it manually)."}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-surface-1 px-2 py-1.5 text-xs text-ink-muted">{flash.url}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(flash.url).then(
                  () => setFlash(null),
                  () => undefined,
                );
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-[12px] border border-hairline bg-surface-1 p-4">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-ink-subtle">
          Client email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-subtle">
          Link expires
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-ink-subtle">
          <input
            type="checkbox"
            checked={allowDownload}
            onChange={(e) => setAllowDownload(e.target.checked)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Allow downloads
        </label>
        <Button size="sm" disabled={busy || !email} onClick={createGrant}>
          {busy ? "Working…" : `Share ${approvedCount} approved file${approvedCount === 1 ? "" : "s"}`}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {approvedCount === 0 && (
        <p className="text-xs text-ink-tertiary">Approve files below first — the gallery shares your approved set.</p>
      )}

      {grants.length > 0 && (
        <div className="flex flex-col divide-y divide-hairline rounded-[12px] border border-hairline bg-surface-1">
          {grants.map((g) => {
            const live = g.state === "active" || g.state === "expiring_soon";
            return (
              <div key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATE_BADGE[g.state]}`}>
                  {g.state.replace("_", " ")}
                </span>
                <div className="min-w-40 flex-1">
                  <p className="truncate text-sm text-ink">{g.clientEmail}</p>
                  <p className="text-xs text-ink-tertiary">
                    {g.assetCount} file{g.assetCount === 1 ? "" : "s"}
                    {g.allowDownload ? " · downloads on" : " · view only"}
                    {" · created "}{fmtDate(g.createdAt)}
                    {g.expiresAt ? ` · expires ${fmtDate(g.expiresAt)}` : " · no expiry"}
                  </p>
                  {(g.views > 0 || g.downloads > 0 || g.lastViewedAt) && (
                    <p className="mt-0.5 text-xs text-ink-tertiary">
                      {g.lastViewedAt ? `Last opened ${fmtDate(g.lastViewedAt)}` : "Never opened"}
                      {g.views > 0 ? ` · ${g.views} view${g.views === 1 ? "" : "s"}` : ""}
                      {g.downloads > 0 ? ` · ${g.downloads} download${g.downloads === 1 ? "" : "s"}` : ""}
                    </p>
                  )}
                </div>
                {live && (
                  <select
                    aria-label="Edit expiry"
                    defaultValue={g.expiresAt ? String(Math.max(1, Math.round((new Date(g.expiresAt).getTime() - Date.now()) / 86400000))) : ""}
                    disabled={busy}
                    onChange={(e) => setExpiry(g.id, e.target.value)}
                    className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
                <div className="flex gap-1.5">
                  {live && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(g.id, "resend")}>
                      Re-send
                    </Button>
                  )}
                  {live && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(g.id, "regenerate")}>
                      New link
                    </Button>
                  )}
                  {g.state === "active" && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(g.id, "revoke")}>
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
