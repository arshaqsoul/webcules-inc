"use client";

/* WEB-182 (Integrations 5/6): client-upload links panel — mint/close
 * tokenized upload links for a project, copy the URL, and review the
 * quarantine queue (approve publishes into the linked client gallery,
 * reject reuses the culling rejection + auto-delete retention). */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";

type QueueAsset = {
  assetId: string;
  status: string;
  uploaderName: string | null;
  filename: string;
  kind: string;
  bytes: number;
  createdAt: string;
};

type RequestView = {
  id: string;
  title: string;
  state: "open" | "closed" | "expired";
  grantId: string | null;
  grantLive: boolean;
  expiresAt: string | null;
  maxFiles: number | null;
  uploadedCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  token: string | null;
  url: string | null;
  fileCap: number;
  assets: QueueAsset[];
};

const fmtBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

export function ClientUploadsPanel({
  projectId,
  grants,
}: {
  projectId: string;
  grants: Array<{ id: string; clientEmail: string; state: string }>;
}) {
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [grantId, setGrantId] = useState("");
  const [expiryDays, setExpiryDays] = useState("");
  const [maxFiles, setMaxFiles] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/upload-requests`);
    if (res.ok) {
      const body = (await res.json()) as { requests: RequestView[] };
      setRequests(body.requests);
    }
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createLink() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/projects/${projectId}/upload-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          grantId: grantId || null,
          expiresInDays: expiryDays ? Number(expiryDays) : null,
          maxFiles: maxFiles ? Number(maxFiles) : null,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setNote(
          json.error === "grant_mismatch"
            ? "That gallery doesn't belong to this project."
            : "Couldn't create the link — check the fields.",
        );
      } else if (
        json.url &&
        typeof navigator !== "undefined" &&
        navigator.clipboard
      ) {
        await navigator.clipboard.writeText(json.url).catch(() => undefined);
        setNote("Link created and copied to your clipboard ✓");
        setTitle("");
        setExpiryDays("");
        setMaxFiles("");
        await load();
      } else {
        setNote("Link created ✓");
        await load();
      }
    } catch {
      setNote("Network error — try again.");
    }
    setBusy(false);
    setTimeout(() => setNote(""), 5000);
  }

  async function setStatus(rid: string, status: "open" | "closed") {
    setBusy(true);
    await fetch(`/api/projects/${projectId}/upload-requests/${rid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
    setBusy(false);
  }

  async function decide(
    rid: string,
    action: "approve" | "reject",
    assetIds: string[],
  ) {
    if (!assetIds.length) return;
    setBusy(true);
    await fetch(`/api/projects/${projectId}/upload-requests/${rid}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, assetIds }),
    });
    await load();
    setBusy(false);
  }

  async function copyUrl(url: string | null) {
    if (!url || typeof navigator === "undefined" || !navigator.clipboard)
      return;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setNote("Link copied ✓");
    setTimeout(() => setNote(""), 3000);
  }

  const liveGrants = grants;

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Client uploads</h2>
      <p className="mb-4 mt-1 text-xs text-ink-subtle">
        Share a link that lets clients and guests (wedding guests, the couple)
        upload photos straight into this project. Everything lands in quarantine
        — nothing is visible in any gallery until you approve it.
      </p>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder='Link name, e.g. "Guest photos"'
          className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm text-ink"
        />
        <select
          value={grantId}
          onChange={(e) => setGrantId(e.target.value)}
          className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm text-ink"
          title="Approvals are published straight into this client gallery"
        >
          <option value="">No gallery link-up</option>
          {liveGrants.map((g) => (
            <option key={g.id} value={g.id}>
              Publish into: {g.clientEmail}
            </option>
          ))}
        </select>
        <input
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="Days"
          className="w-20 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm text-ink"
          title="Link expiry in days (blank = never expires)"
        />
        <input
          value={maxFiles}
          onChange={(e) => setMaxFiles(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="Max files"
          className="w-24 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm text-ink"
          title="File cap for this link (blank = 500)"
        />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" disabled={busy || !title.trim()} onClick={createLink}>
          Create upload link
        </Button>
        {note && <span className="text-xs text-ink-subtle">{note}</span>}
      </div>

      {loaded && requests.length === 0 && (
        <p className="mt-4 text-sm text-ink-subtle">No upload links yet.</p>
      )}

      <div className="mt-4 space-y-4">
        {requests.map((r) => {
          const pending = r.assets.filter((a) => a.status === "pending");
          const decided = r.assets.filter((a) => a.status !== "pending");
          return (
            <div
              key={r.id}
              className="rounded-lg border border-hairline bg-canvas p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-medium text-ink">
                    {r.title}
                  </span>
                  <span
                    className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: r.state === "open" ? "#e5f2e5" : "#f2f0eb",
                      color: r.state === "open" ? "#207226" : "#6b6f76",
                    }}
                  >
                    {r.state === "open"
                      ? "Open"
                      : r.state === "closed"
                        ? "Closed"
                        : "Expired"}
                  </span>
                  {r.grantId && (
                    <span className="ml-2 text-[11px] text-ink-subtle">
                      {r.grantLive
                        ? "approvals publish into the gallery"
                        : "linked gallery is no longer live"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !r.url}
                    onClick={() => copyUrl(r.url)}
                  >
                    Copy link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      setStatus(r.id, r.state === "open" ? "closed" : "open")
                    }
                  >
                    {r.state === "open" ? "Close" : "Reopen"}
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-xs text-ink-subtle">
                {r.uploadedCount} uploaded · {r.pendingCount} awaiting review ·{" "}
                {r.approvedCount} approved · {r.rejectedCount} rejected
                {r.maxFiles ? ` · cap ${r.maxFiles}` : ""}
                {r.expiresAt
                  ? ` · expires ${new Date(r.expiresAt).toLocaleDateString()}`
                  : ""}
              </p>

              {pending.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-ink">
                      Awaiting your review
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          decide(
                            r.id,
                            "approve",
                            pending.map((a) => a.assetId),
                          )
                        }
                      >
                        Approve all
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          decide(
                            r.id,
                            "reject",
                            pending.map((a) => a.assetId),
                          )
                        }
                      >
                        Reject all
                      </Button>
                    </div>
                  </div>
                  <ul className="mt-2 divide-y divide-hairline rounded-md border border-hairline">
                    {pending.map((a) => (
                      <li
                        key={a.assetId}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span className="truncate text-ink">
                          {a.filename}{" "}
                          <span className="text-xs text-ink-subtle">
                            · {fmtBytes(a.bytes)}
                            {a.uploaderName ? ` · from ${a.uploaderName}` : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-1.5">
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => decide(r.id, "approve", [a.assetId])}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => decide(r.id, "reject", [a.assetId])}
                          >
                            Reject
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {decided.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-ink-subtle">
                    Reviewed ({decided.length})
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {decided.map((a) => (
                      <li
                        key={a.assetId}
                        className="flex items-center justify-between text-xs text-ink-subtle"
                      >
                        <span className="truncate">
                          {a.filename} · {fmtBytes(a.bytes)}
                          {a.uploaderName ? ` · from ${a.uploaderName}` : ""}
                        </span>
                        <span
                          style={{
                            color:
                              a.status === "approved" ? "#207226" : "#c0271f",
                          }}
                        >
                          {a.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
