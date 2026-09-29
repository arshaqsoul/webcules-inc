"use client";

/* Client gallery panel — share links for this project: create (emails the
 * client), re-send, regenerate (old link dies), revoke, expiry editing. */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@webcules/ui/components/dialog";
import { useConfirm } from "@/components/confirm-provider";
import { MediaLightbox, type LightboxItem } from "@/components/media-lightbox";

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
  selectionMode: string;
  selectionLimit: number | null;
  selectionDeadline: number | null;
  favoritesCount: number;
  selection: { count: number; note: string | null; submittedAt: string; clientEmail: string } | null;
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
  folders,
  grants,
  watermarkOverride: initialOverride,
  canLite,
  canStudio,
}: {
  projectId: string;
  clientEmail: string;
  approvedCount: number;
  /** WEB-216: folders with their approved/shared (deliverable) counts. */
  folders: { id: string; name: string; count: number }[];
  grants: GrantItem[];
  /** WEB-242: per-project watermark override. */
  watermarkOverride: "inherit" | "on" | "off";
  /** WEB-261: tier flags for the download controls (PIN/web-size Lite+,
   * approvals hub Studio+). */
  canLite?: boolean;
  canStudio?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [wmOverride, setWmOverride] = useState<"inherit" | "on" | "off">(initialOverride);
  const [wmBusy, setWmBusy] = useState(false);
  const [email, setEmail] = useState(clientEmail);
  const [days, setDays] = useState("30");
  const [allowDownload, setAllowDownload] = useState(true);
  const [selectionMode, setSelectionMode] = useState<"favorites" | "selection" | "off">("favorites");
  const [selectionLimitInput, setSelectionLimitInput] = useState("50");
  const [selectionDeadlineInput, setSelectionDeadlineInput] = useState("");
  // WEB-216: empty set = deliver everything approved; otherwise only the
  // checked folders' approved files ship in this link.
  const [deliverFolders, setDeliverFolders] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ grant: GrantItem; favorites: string[]; selection: { items: string[]; note: string | null; submittedAt: string } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ url: string; emailed: boolean } | null>(null);
  // WEB-223: expandable "what was sent" grid per grant.
  const [expanded, setExpanded] = useState<string | null>(null);
  // WEB-261: download requests awaiting decision (this project's grants).
  const [pendingDl, setPendingDl] = useState<{ id: string; grantId: string; clientEmail: string; scope: string; folderName: string | null; sizePref: string; fileCount: number | null; note: string | null; createdAt: string }[]>([]);
  const grantIds = useMemo(() => new Set(grants.map((g) => g.id)), [grants]);

  const loadPending = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/download-requests?state=requested");
      if (!res.ok) return;
      const body = (await res.json()) as { requests?: { id: string; grantId: string; clientEmail: string; scope: string; folderName: string | null; sizePref: string; fileCount: number | null; note: string | null; createdAt: string }[] };
      setPendingDl((body.requests ?? []).filter((r) => grantIds.has(r.grantId)));
    } catch {
      // hub is progressive — the list just stays empty on failure
    }
  }, [grantIds]);
  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  async function decideDownload(id: string, action: "approve" | "reject") {
    setBusy(true);
    try {
      const res = await fetch(`/api/studio/download-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) setPendingDl((cur) => cur.filter((r) => r.id !== id));
    } catch {
      // keep the row; retry on next render
    }
    setBusy(false);
  }

  async function setOverride(next: "inherit" | "on" | "off") {
    setWmOverride(next);
    setWmBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/watermark`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override: next }),
      });
      if (!res.ok) {
        setWmOverride(initialOverride);
        setError("Couldn't save the watermark setting — try again.");
      } else {
        router.refresh();
      }
    } catch {
      setWmOverride(initialOverride);
      setError("Network error — try again.");
    }
    setWmBusy(false);
  }
  const [sentAssets, setSentAssets] = useState<Record<string, { id: string; filename: string; kind: string; folder: string | null }[]>>({});
  const [lightbox, setLightbox] = useState<number | null>(null);

  const deliverableFolders = folders.filter((f) => f.count > 0);
  const deliverCount = deliverFolders.size
    ? deliverableFolders.filter((f) => deliverFolders.has(f.id)).reduce((n, f) => n + f.count, 0)
    : approvedCount;

  function toggleDeliver(id: string) {
    setDeliverFolders((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createGrant() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientEmail: email,
          ...(deliverFolders.size ? { folderIds: Array.from(deliverFolders) } : {}),
          expiresInDays: days ? Number(days) : null,
          allowDownload,
          selectionMode,
          selectionLimit: selectionMode === "selection" ? Number(selectionLimitInput) || null : null,
          selectionDeadline:
            selectionMode === "selection" && selectionDeadlineInput
              ? Math.floor(new Date(`${selectionDeadlineInput}T23:59:59`).getTime() / 1000)
              : null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; emailed?: boolean; error?: string };
      if (!res.ok) {
        setError(
          body.error === "no_assets"
            ? "Nothing approved in that selection — approve some files in those folders first."
            : body.error === "invalid_email"
              ? "Enter a valid client email."
              : "Could not create the link — try again.",
        );
      } else {
        setFlash({ url: body.url ?? "", emailed: Boolean(body.emailed) });
        setDeliverFolders(new Set());
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

  async function openFeedback(g: GrantItem) {
    setBusy(true);
    try {
      const res = await fetch(`/api/grants/${g.id}/feedback`);
      if (res.ok) {
        const body = (await res.json()) as { favorites: string[]; selection: { items: string[]; note: string | null; submittedAt: string } | null };
        setFeedback({ grant: g, favorites: body.favorites, selection: body.selection });
      }
    } catch { /* ignore */ }
    setBusy(false);
  }

  async function toggleExpanded(g: GrantItem) {
    if (expanded === g.id) {
      setExpanded(null);
      return;
    }
    setExpanded(g.id);
    if (!sentAssets[g.id]) {
      try {
        const res = await fetch(`/api/grants/${g.id}/assets`);
        if (res.ok) {
          const body = (await res.json()) as { assets: { id: string; filename: string; kind: string; folder: string | null }[] };
          setSentAssets((cur) => ({ ...cur, [g.id]: body.assets }));
        }
      } catch { /* row just stays empty */ }
    }
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

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-hairline bg-surface-1 px-4 py-3">
        <p className="text-xs text-ink-subtle">
          <span className="font-medium text-ink">Watermark on this project's galleries</span>
          <span className="ml-1 text-ink-tertiary">(previews only — originals and standard downloads stay clean)</span>
        </p>
        <select
          value={wmOverride}
          onChange={(e) => void setOverride(e.target.value as "inherit" | "on" | "off")}
          disabled={wmBusy}
          aria-label="Watermark override"
          className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted outline-none"
        >
          <option value="inherit">Use studio setting</option>
          <option value="on">Always watermark</option>
          <option value="off">Never watermark</option>
        </select>
      </div>

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
            className="snap-select rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary"
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
        <label className="flex flex-col gap-1 text-xs text-ink-subtle">
          Client picks
          <select
            value={selectionMode}
            onChange={(e) => setSelectionMode(e.target.value as "favorites" | "selection" | "off")}
            className="snap-select rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="favorites">Favorites (♥ anything)</option>
            <option value="selection">Selection (pick for album)</option>
            <option value="off">Off</option>
          </select>
        </label>
        {selectionMode === "selection" && (
          <>
            <label className="flex flex-col gap-1 text-xs text-ink-subtle">
              Max picks
              <input
                type="number"
                min={1}
                max={10000}
                value={selectionLimitInput}
                onChange={(e) => setSelectionLimitInput(e.target.value)}
                className="w-24 rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-subtle">
              Pick deadline
              <input
                type="date"
                value={selectionDeadlineInput}
                onChange={(e) => setSelectionDeadlineInput(e.target.value)}
                className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
          </>
        )}
        <Button size="sm" disabled={busy || !email} onClick={createGrant}>
          {busy ? "Working…" : `Share ${deliverCount} approved file${deliverCount === 1 ? "" : "s"}${deliverFolders.size ? ` · ${deliverFolders.size} folder${deliverFolders.size === 1 ? "" : "s"}` : ""}`}
        </Button>
      </div>
      {deliverableFolders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[12px] border border-hairline bg-surface-1 px-4 py-2.5">
          <span className="mr-1 text-xs text-ink-subtle">
            Deliver {deliverFolders.size ? "only:" : "everything approved, or just:"}
          </span>
          <button
            type="button"
            onClick={() => setDeliverFolders(new Set())}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${deliverFolders.size === 0 ? "bg-primary/10 text-primary" : "text-ink-subtle hover:bg-surface-2 hover:text-ink"}`}
          >
            All approved · {approvedCount}
          </button>
          {deliverableFolders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => toggleDeliver(f.id)}
              aria-pressed={deliverFolders.has(f.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${deliverFolders.has(f.id) ? "bg-primary/10 text-primary" : "text-ink-subtle hover:bg-surface-2 hover:text-ink"}`}
            >
              {f.name} · {f.count}
            </button>
          ))}
          <span className="ml-auto hidden text-[11px] text-ink-tertiary sm:inline">The client sees these as folders in their gallery.</span>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {approvedCount === 0 && (
        <p className="text-xs text-ink-tertiary">Approve files below first — the gallery shares your approved set.</p>
      )}

      {grants.length > 0 && (
        <div className="flex flex-col divide-y divide-hairline rounded-[12px] border border-hairline bg-surface-1">
          {pendingDl.length > 0 && (
            <div className="rounded-[12px] border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm font-medium text-ink">Download requests awaiting your approval</p>
              <ul className="mt-2 flex flex-col gap-2">
                {pendingDl.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-sm">
                    <span className="text-ink">
                      {r.scope === "all" ? "Whole gallery" : r.scope === "folder" ? `Folder “${r.folderName ?? "?"}”` : r.scope === "favorites" ? "Their favorites" : "Selected photos"}
                      {r.fileCount ? ` · ${r.fileCount} photos` : ""} · {r.sizePref === "web" ? "web size" : "full size"}
                    </span>
                    {r.note ? <span className="text-xs italic text-ink-subtle">“{r.note}”</span> : null}
                    <span className="ml-auto flex gap-1.5">
                      <Button size="sm" disabled={busy} onClick={() => void decideDownload(r.id, "approve")}>Approve</Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decideDownload(r.id, "reject")}>Decline</Button>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-tertiary">Approved ZIPs build overnight and email the client automatically.</p>
            </div>
          )}

          {grants.map((g) => {
            const live = g.state === "active" || g.state === "expiring_soon";
            const isOpen = expanded === g.id;
            return (
              <div key={g.id} className="flex flex-col">
              <GrantDownloadSettings grantId={g.id} canLite={canLite !== false} canStudio={canStudio !== false} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
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
                  {g.selectionMode !== "off" && (
                    <p className="mt-0.5 text-xs text-primary">
                      {g.selectionMode === "selection"
                        ? g.selection
                          ? `Selection in: ${g.selection.count} picked${g.selectionLimit ? ` of ${g.selectionLimit}` : ""} · ${fmtDate(g.selection.submittedAt)}`
                          : `Awaiting selection${g.selectionLimit ? ` (max ${g.selectionLimit})` : ""}${g.selectionDeadline ? ` · due ${fmtDate(new Date(g.selectionDeadline).toISOString())}` : ""}`
                        : `${g.favoritesCount} favorite${g.favoritesCount === 1 ? "" : "s"}`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void toggleExpanded(g)}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Hide files sent to ${g.clientEmail}` : `Show files sent to ${g.clientEmail}`}
                  className="rounded-md p-1 text-ink-tertiary transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                </button>
                {live && (
                  <select
                    aria-label="Edit expiry"
                    defaultValue={g.expiresAt ? String(Math.max(1, Math.round((new Date(g.expiresAt).getTime() - Date.now()) / 86400000))) : ""}
                    disabled={busy}
                    onChange={(e) => setExpiry(g.id, e.target.value)}
                    className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
                <div className="flex gap-1.5">
                  {live && g.selectionMode !== "off" && (g.favoritesCount > 0 || g.selection) && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void openFeedback(g)}>
                      {g.selectionMode === "selection" && g.selection ? "View picks" : "View ♥"}
                    </Button>
                  )}
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
              {isOpen && (
                <div className="border-t border-hairline px-4 py-3">
                  {(sentAssets[g.id] ?? []).length === 0 ? (
                    <p className="py-2 text-center text-xs text-ink-subtle">Loading delivered files…</p>
                  ) : (
                    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10 md:grid-cols-12">
                      {(sentAssets[g.id] ?? []).map((a, i) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setLightbox(i)}
                          aria-label={`View ${a.filename}`}
                          className="group relative aspect-square overflow-hidden rounded-md border border-hairline bg-surface-1"
                        >
                          {a.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                            <img src={`/api/assets/${a.id}?variant=thumb`} alt={a.filename} loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[8px] uppercase text-ink-tertiary">{a.kind}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}

      {lightbox !== null && expanded && sentAssets[expanded] && (
        <MediaLightbox
          items={sentAssets[expanded].map((a) => ({ id: a.id, filename: a.filename, kind: a.kind }))}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}

      <Dialog open={feedback !== null} onOpenChange={(v) => !v && setFeedback(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Client picks — {feedback?.grant.clientEmail}</DialogTitle>
            <DialogDescription>
              {feedback?.selection
                ? `Selection of ${feedback.selection.items.length} submitted ${feedback?.selection ? fmtDate(feedback.selection.submittedAt) : ""}.`
                : `${feedback?.favorites.length ?? 0} favorite${feedback?.favorites.length === 1 ? "" : "s"} so far.`}
            </DialogDescription>
          </DialogHeader>
          {feedback?.selection?.note && (
            <p className="rounded-md bg-surface-2 p-3 text-sm text-ink">“{feedback.selection.note}”</p>
          )}
          <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
            {(feedback?.selection?.items ?? feedback?.favorites ?? []).map((assetId) => (
              // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
              <img
                key={assetId}
                src={`/api/assets/${assetId}?variant=thumb`}
                alt=""
                loading="lazy"
                className="aspect-square w-full rounded-md border border-hairline object-cover"
              />
            ))}
            {((feedback?.selection?.items ?? feedback?.favorites ?? []).length === 0) && (
              <p className="col-span-full py-6 text-center text-sm text-ink-subtle">Nothing picked yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** WEB-261: per-grant download controls — PIN, soft cap, approvals toggle,
 * web-size option. Tier gates mirror the API (PIN/web-size Lite+, approval
 * Studio+); hidden entirely for view-only grants. */
function GrantDownloadSettings({ grantId, canLite, canStudio }: { grantId: string; canLite: boolean; canStudio: boolean }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [limit, setLimit] = useState("");
  const [approval, setApproval] = useState(false);
  const [webSize, setWebSize] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [sharing, setSharing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    const res = await fetch(`/api/grants/${grantId}/download-settings`);
    if (!res.ok) return;
    const body = (await res.json()) as { settings: { pin: boolean; limit: number | null; approval: boolean; webSize: boolean }; allowSharing?: boolean };
    setHasPin(body.settings.pin);
    setLimit(body.settings.limit === null ? "" : String(body.settings.limit));
    setApproval(body.settings.approval);
    setWebSize(body.settings.webSize);
    setSharing(body.allowSharing !== false);
  }

  useEffect(() => {
    if (open) void load();
  }, [open, grantId]);

  async function save(clearPin = false) {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/grants/${grantId}/download-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { limit: limit === "" ? null : Number(limit), approval, webSize },
          ...(clearPin ? { clearPin: true } : pin ? { pin } : {}),
          allowSharing: sharing,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setNote(
          body.error === "pin_requires_lite" || body.error === "web_size_requires_lite" ? "PIN and web-size are Lite features."
          : body.error === "approvals_require_studio" ? "Download approvals are a Studio feature."
          : body.error === "invalid_pin" ? "PIN is 4–8 digits."
          : "Couldn't save — try again.",
        );
      } else {
        setPin("");
        setNote("Saved ✓");
        await load();
      }
    } catch {
      setNote("Network error — try again.");
    }
    setBusy(false);
    setTimeout(() => setNote(""), 3500);
  }

  return (
    <div className="border-t border-hairline px-4 py-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-ink-subtle hover:text-ink">
        {open ? "▾" : "▸"} Download controls
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 pb-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-ink-subtle">
              PIN
              <input
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder={hasPin ? "•••• (set)" : "none"}
                disabled={!canLite}
                className="w-24 rounded-md border border-hairline bg-canvas px-2 py-1 text-sm text-ink disabled:opacity-50"
              />
              {hasPin && (
                <button type="button" disabled={busy || !canLite} onClick={() => void save(true)} className="text-xs text-ink-tertiary underline underline-offset-2">
                  clear
                </button>
              )}
            </label>
            <label className="flex items-center gap-2 text-ink-subtle">
              Max downloads
              <input
                inputMode="numeric"
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
                placeholder="∞"
                className="w-20 rounded-md border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
              />
            </label>
            <label className="flex items-center gap-2 text-ink-subtle" title="Client ZIP requests wait for your approval">
              <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} disabled={!canStudio} className="h-4 w-4" />
              Approvals
            </label>
            <label className="flex items-center gap-2 text-ink-subtle" title="Offer a 2048px web-size option">
              <input type="checkbox" checked={webSize} onChange={(e) => setWebSize(e.target.checked)} disabled={!canLite} className="h-4 w-4" />
              Web size
            </label>
            <label className="flex items-center gap-2 text-ink-subtle" title="Clients can share single photos as link cards (they die with this gallery)">
              <input type="checkbox" checked={sharing} onChange={(e) => setSharing(e.target.checked)} className="h-4 w-4" />
              Social sharing
            </label>
            <Button size="sm" disabled={busy} onClick={() => void save()} className="ml-auto">
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
          {!canLite && <p className="text-xs text-ink-tertiary">PIN and web-size downloads are Lite features — upgrade to unlock.</p>}
          {canLite && !canStudio && <p className="text-xs text-ink-tertiary">Download approvals are a Studio feature.</p>}
          {note && <p className="text-xs text-ink-subtle">{note}</p>}
        </div>
      )}
    </div>
  );
}
