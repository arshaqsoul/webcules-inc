"use client";

/* WEB-263: install + service-worker runtime for the client home —
 * beforeinstallprompt capture, the iOS instructions card, SW registration,
 * the revocation heartbeat (purge token change ⇒ SW evicts cached media),
 * and offline-favorite syncing for the gallery pages. */

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function MyInstallBanner({ studioName }: { studioName: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    setIsIos(ios);
    try {
      setDismissed(localStorage.getItem("snap-my-install-dismissed") === "1");
    } catch {
      // private mode — banner still fine
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (dismissed) return null;

  return (
    <div className="rounded-[12px] border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Add {studioName} to your Home Screen</p>
          <p className="text-xs text-ink-subtle">Your photos, as an app — works offline once opened.</p>
        </div>
        {deferred && (
          <button
            type="button"
            onClick={() => {
              void deferred.prompt();
              setDeferred(null);
            }}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white"
          >
            Install
          </button>
        )}
        {isIos && (
          <button type="button" onClick={() => setShowIos((s) => !s)} className="rounded-lg border border-hairline px-4 py-2 text-xs font-medium text-ink">
            How
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem("snap-my-install-dismissed", "1");
            } catch {}
          }}
          className="rounded-md px-2 py-1 text-xs text-ink-tertiary hover:text-ink"
        >
          ✕
        </button>
      </div>
      {isIos && showIos && (
        <p className="mt-3 border-t border-hairline pt-3 text-xs leading-relaxed text-ink-subtle">
          Tap the <strong>Share</strong> button in Safari&apos;s toolbar, then <strong>Add to Home Screen</strong>. The app icon appears alongside your others and opens straight here.
        </p>
      )}
    </div>
  );
}

/** Registers the service worker + runs the launch heartbeat + the offline
 * favorites flush. Mounted by /my and the gallery page. */
export function PwaRuntime({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {});

    // Revocation propagation: the purge token changes when any gallery of
    // this device's email dies; the SW then evicts cached media.
    void fetch("/my/heartbeat")
      .then((r) => (r.ok ? (r.json() as Promise<{ purgeToken?: string }>) : Promise.resolve(null)))
      .then((b: { purgeToken?: string } | null) => {
        if (!b?.purgeToken) return;
        try {
          const last = localStorage.getItem("snap-my-purge-token");
          if (last && last !== b.purgeToken) {
            navigator.serviceWorker.ready.then((reg) => {
              void reg.active?.postMessage({ type: "PURGE_MEDIA" });
            });
          }
          localStorage.setItem("snap-my-purge-token", b.purgeToken);
        } catch {}
      })
      .catch(() => {});

    // Offline favorites: flush the queue whenever we come online.
    const flush = () => void flushFavoriteQueue();
    window.addEventListener("online", flush);
    flush();
    return () => window.removeEventListener("online", flush);
  }, [enabled]);
  return null;
}

/* ---------------- offline favorites queue (localStorage-backed) ---------------- */

type FavOp = { token: string; assetId: string; at: number };

function readQueue(): FavOp[] {
  try {
    return JSON.parse(localStorage.getItem("snap-fav-queue") ?? "[]") as FavOp[];
  } catch {
    return [];
  }
}

function writeQueue(ops: FavOp[]): void {
  try {
    localStorage.setItem("snap-fav-queue", JSON.stringify(ops.slice(-200)));
  } catch {}
}

/** Queue a favorite/unfavorite that failed to sync (idempotent add/remove,
 * last-write-wins per photo). */
export function queueFavoriteOp(token: string, assetId: string): void {
  const ops = readQueue().filter((o) => !(o.token === token && o.assetId === assetId));
  ops.push({ token, assetId, at: Date.now() });
  writeQueue(ops);
}

export async function flushFavoriteQueue(): Promise<void> {
  const ops = readQueue();
  if (!ops.length || !navigator.onLine) return;
  // The op's current desired state comes from the gallery page's own store
  // (keyed snapshot below); replaying uses the last recorded state.
  for (const op of ops.slice()) {
    const desired = latestDesiredState(op.token, op.assetId);
    if (desired === null) continue;
    try {
      const res = await fetch(`/api/g/${op.token}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: op.assetId, favorited: desired }),
      });
      if (res.ok) {
        writeQueue(readQueue().filter((o) => !(o.token === op.token && o.assetId === op.assetId)));
      } else if (res.status === 401 || res.status === 404) {
        // grant gone — drop the op
        writeQueue(readQueue().filter((o) => !(o.token === op.token && o.assetId === op.assetId)));
      } else {
        break; // transient — keep and retry later
      }
    } catch {
      break;
    }
  }
}

function latestDesiredState(token: string, assetId: string): boolean | null {
  try {
    const map = JSON.parse(localStorage.getItem("snap-fav-state") ?? "{}") as Record<string, boolean>;
    const v = map[`${token}:${assetId}`];
    return v === undefined ? null : v;
  } catch {
    return null;
  }
}

export function recordFavoriteState(token: string, assetId: string, favorited: boolean): void {
  try {
    const map = JSON.parse(localStorage.getItem("snap-fav-state") ?? "{}") as Record<string, boolean>;
    map[`${token}:${assetId}`] = favorited;
    localStorage.setItem("snap-fav-state", JSON.stringify(map));
  } catch {}
}
