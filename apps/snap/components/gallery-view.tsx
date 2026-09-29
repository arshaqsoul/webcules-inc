"use client";

/* Public gallery surface (WEB-125 + WEB-132): the OTP gate, the granted-assets
 * grid + lightbox, and the denied/expired/revoked states. Self-contained
 * styling (no dashboard chrome) — accent comes from the studio's brand. */
import { useCallback, useEffect, useRef, useState } from "react";

import { FileTypeIcon } from "@/components/file-type-icon";

declare global {
  interface Window {
    turnstile?: {
      render: (el: string | HTMLElement, opts: { sitekey: string; callback: (t: string) => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

type Brand = {
  studioName: string;
  accent: string;
  logoUrl: string | null;
  contactEmail: string | null;
  /** Studio+ plans may remove Snap branding (WEB-151 white-label gate). */
  whiteLabel?: boolean;
  /** WEB-242: serve watermarked previews (effective config on). */
  watermarked?: boolean;
};

export type GalleryAsset = {
  id: string;
  filename: string;
  kind: string;
  mimeType: string;
  bytes: number;
  /** WEB-216: folder label snapshotted at delivery — the gallery groups by it. */
  folder?: string | null;
};

/** WEB-160: gallery image with 429 backoff — a rate-limited load retries
 * with increasing spacing (5s/15s/25s) instead of showing a broken image. */
function BackoffImage(props: {
  id: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  /** WEB-116: thumb for grid tiles, preview for the lightbox. */
  variant?: "thumb" | "preview" | "preview_wm";
  onClick?: React.MouseEventHandler<HTMLImageElement>;
}) {
  const [attempt, setAttempt] = useState(0);
  const src = `/api/assets/${props.id}?variant=${props.variant ?? "thumb"}${attempt ? `&r=${attempt}` : ""}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
    <img
      src={src}
      alt={props.alt}
      loading={props.loading}
      className={props.className}
      onClick={props.onClick}
      onError={() => {
        if (attempt < 3) {
          setTimeout(() => setAttempt((a) => a + 1), 5000 + attempt * 10000);
        }
      }}
    />
  );
}

function fmtBytes(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* ---------------- Denied / expired / revoked ---------------- */

export function GalleryDenied({ reason, studioName, contactEmail, whiteLabel }: {
  reason: "dead" | "unknown";
  studioName?: string;
  contactEmail?: string | null;
  /** WEB-238: white-labeled studios get `© {studio}` instead of the Snap footer. */
  whiteLabel?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6" style={{ ["--accent" as string]: "#5e6ad2" }}>
      <div className="w-full max-w-md rounded-[16px] border border-hairline bg-surface-1 p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink-subtle" aria-hidden>
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-ink">Access denied</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-subtle">
          {reason === "dead"
            ? "This gallery link is no longer active or has expired."
            : "This link doesn't look right — check that you opened the full link your photographer sent you."}
        </p>
        {reason === "dead" && studioName && (
          <p className="mt-3 text-sm text-ink-subtle">
            Contact {studioName}
            {contactEmail ? (
              <>
                {" "}at <a href={`mailto:${contactEmail}`} className="font-medium text-ink underline underline-offset-2">{contactEmail}</a>
              </>
            ) : null}
            .
          </p>
        )}
        <p className="mt-6 text-xs text-ink-tertiary">
          {whiteLabel && studioName ? `© ${studioName}` : "Delivered by Snap · snap.webcules.com"}
        </p>
      </div>
    </main>
  );
}

/* ---------------- OTP gate ---------------- */

export function GalleryGate({ studioName, accent, logoUrl, whiteLabel, token, maskedEmail, turnstileSiteKey }: Brand & {
  token: string;
  maskedEmail: string;
  turnstileSiteKey: string;
}) {
  // WEB-238: effective flag arrives from the server (entitlement AND toggle).
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [tsToken, setTsToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const tsRef = useRef<HTMLDivElement>(null);
  const tsIdRef = useRef<string | null>(null);

  // Load the Turnstile script (once) and render the widget explicitly.
  useEffect(() => {
    if (!turnstileSiteKey) return;
    let cancelled = false;
    if (!document.querySelector("script[data-snap-turnstile]")) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      s.dataset.snapTurnstile = "1";
      document.head.appendChild(s);
    }
    const tryRender = () => {
      if (cancelled || tsIdRef.current || !window.turnstile || !tsRef.current) return;
      tsIdRef.current = window.turnstile.render(tsRef.current, {
        sitekey: turnstileSiteKey,
        callback: (t) => setTsToken(t),
      });
    };
    tryRender();
    const iv = setInterval(() => {
      if (tsIdRef.current) return clearInterval(iv);
      tryRender();
    }, 400);
    return () => { cancelled = true; clearInterval(iv); };
  }, [turnstileSiteKey]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(resend = false) {
    if (busy || (resend && cooldown > 0)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/g/${token}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: tsToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.status === 429) {
        setError(body.error === "otp_disabled" ? "Verification codes are currently disabled." : "Too many codes requested — try again in a few minutes.");
      } else if (!body.ok) {
        setError(
          body.error === "invalid_email" ? "That email doesn't match this gallery."
          : body.error === "captcha_failed" ? "Please complete the verification check."
          : body.error === "email_failed" ? "We couldn't send the email — please try again."
          : "Something went wrong — please try again.",
        );
      } else {
        setStep("code");
        setCooldown(30);
        window.turnstile?.reset(tsIdRef.current ?? undefined);
        setTsToken("");
      }
    } catch {
      setError("Network error — please try again.");
    }
    setBusy(false);
  }

  async function verify() {
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/g/${token}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (body.ok) {
        window.location.reload(); // cookie is set — server renders the gallery
      } else {
        setError("That code isn't right — check the latest email and try again.");
        setCode("");
      }
    } catch {
      setError("Network error — please try again.");
    }
    setBusy(false);
  }

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (step === "email") void sendCode();
      else void verify();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step closure is current
    [step, email, code, tsToken, busy, cooldown],
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6" style={{ ["--accent" as string]: accent }}>
      <div className="w-full max-w-md rounded-[16px] border border-hairline bg-surface-1 p-8">
        <div className="mb-6 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
            <img src={logoUrl} alt={studioName} className="max-h-9 max-w-40 object-contain" />
          ) : (
            <span className="text-[15px] font-semibold text-ink">{studioName}</span>
          )}
        </div>

        <h1 className="text-lg font-semibold text-ink">
          {step === "email" ? "Verify it's you" : "Enter your code"}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">
          {step === "email" ? (
            <>This gallery was shared with <span className="font-medium text-ink">{maskedEmail}</span>. Enter that email and we'll send you a 6-digit code.</>
          ) : (
            <>We sent a code to <span className="font-medium text-ink">{maskedEmail}</span>. It expires in 10 minutes.</>
          )}
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3.5">
          {step === "email" && (
            <>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-hairline-strong bg-canvas px-3.5 py-2.5 text-sm text-ink outline-none focus:border-[var(--accent)]"
              />
              {turnstileSiteKey && <div ref={tsRef} className="min-h-[65px]" />}
            </>
          )}
          {step === "code" && (
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              className="w-full rounded-lg border border-hairline-strong bg-canvas px-3.5 py-2.5 text-center text-xl tracking-[0.5em] text-ink outline-none focus:border-[var(--accent)]"
            />
          )}

          {error && <p className="text-xs leading-relaxed text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={busy || (step === "code" && !/^\d{6}$/.test(code))}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-60"
            style={{ background: accent }}
          >
            {busy ? "Working…" : step === "email" ? "Send code" : "Open gallery"}
          </button>

          {step === "code" && (
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => void sendCode(true)}
              className="text-xs text-ink-subtle underline underline-offset-2 disabled:no-underline disabled:opacity-60"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't get it? Resend"}
            </button>
          )}
        </form>

        <p className="mt-6 border-t border-hairline pt-4 text-xs text-ink-tertiary">
          {whiteLabel ? `© ${studioName}` : "Delivered by Snap · snap.webcules.com"}
        </p>
      </div>
    </main>
  );
}

/* ---------------- Gallery view ---------------- */

export function GalleryView({ studioName, accent, logoUrl, contactEmail, whiteLabel, watermarked, assets, allowDownload, expiresAt, selectionMode, selectionLimit, selectionDeadline, initialFavorites, submittedSelection, clientToken }: Brand & {
  assets: GalleryAsset[];
  allowDownload: boolean;
  expiresAt: string | null;
  /** Client interaction (WEB-209 P1): off | favorites | selection. */
  selectionMode: "off" | "favorites" | "selection";
  selectionLimit: number | null;
  selectionDeadline: number | null;
  initialFavorites: string[];
  submittedSelection: { items: string[]; note: string | null; submittedAt: string } | null;
  clientToken: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set(initialFavorites));
  const [picks, setPicks] = useState<Set<string>>(new Set(submittedSelection?.items ?? []));
  const [submitted, setSubmitted] = useState<{ items: string[]; note: string | null; submittedAt: string } | null>(submittedSelection);
  const [note, setNote] = useState(submittedSelection?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  // WEB-216: folder navigation — null = all photos. Favorites/selection stay
  // gallery-wide; only the grid + lightbox walk the visible slice.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  const folderNames = Array.from(new Set(assets.map((a) => a.folder).filter((f): f is string => Boolean(f))));
  const visible = activeFolder ? assets.filter((a) => a.folder === activeFolder) : assets;

  const deadlinePassed = selectionDeadline !== null && selectionDeadline < Date.now();
  const heartsOn = selectionMode !== "off";
  const picking = selectionMode === "selection" && !deadlinePassed;

  async function heart(assetId: string) {
    const next = new Set(favorites);
    if (next.has(assetId)) next.delete(assetId);
    else next.add(assetId);
    setFavorites(next);
    try {
      const res = await fetch(`/api/g/${clientToken}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { favorited: boolean };
      setFavorites((cur) => {
        const fixed = new Set(cur);
        if (body.favorited) fixed.add(assetId);
        else fixed.delete(assetId);
        return fixed;
      });
    } catch {
      setFavorites(new Set(initialFavorites));
      setFlash("Couldn't save that — check your connection and try again.");
      setTimeout(() => setFlash(""), 3000);
    }
  }

  function togglePick(assetId: string) {
    if (!picking) return;
    setPicks((cur) => {
      const next = new Set(cur);
      if (next.has(assetId)) next.delete(assetId);
      else if (selectionLimit === null || next.size < selectionLimit) next.add(assetId);
      else return cur; // at the limit — ignore extra picks
      return next;
    });
  }

  async function submit() {
    if (busy || !picks.size) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/g/${clientToken}/selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds: Array.from(picks), note: note.trim() || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setFlash(body.error === "limit_exceeded" ? "Too many picks — remove a few first." : "Couldn't submit — try again.");
        setTimeout(() => setFlash(""), 3500);
      } else {
        setSubmitted({ items: Array.from(picks), note: note.trim() || null, submittedAt: new Date().toISOString() });
        setFlash("Selection sent to your photographer ✓");
        setTimeout(() => setFlash(""), 4000);
      }
    } catch {
      setFlash("Network error — try again.");
      setTimeout(() => setFlash(""), 3000);
    }
    setBusy(false);
  }

  const close = useCallback(() => setOpen(null), []);
  const stepIdx = useCallback(
    (dir: 1 | -1) => setOpen((cur) => (cur === null ? cur : (cur + dir + visible.length) % visible.length)),
    [visible.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") stepIdx(1);
      if (e.key === "ArrowLeft") stepIdx(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, stepIdx]);

  const current = open !== null ? visible[open] : null;
  const expiry = expiresAt
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(expiresAt))
    : null;

  return (
    <main className="min-h-screen bg-canvas" style={{ ["--accent" as string]: accent }}>
      <header className="sticky top-0 z-10 border-b border-hairline bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
            <img src={logoUrl} alt={studioName} className="max-h-8 max-w-36 object-contain" />
          ) : (
            <span className="text-sm font-semibold text-ink">{studioName}</span>
          )}
          <span className="text-xs text-ink-tertiary">
            {assets.length} item{assets.length === 1 ? "" : "s"}
          </span>
          <span className="ml-auto text-xs text-ink-tertiary">
            {expiry ? `Link expires ${expiry}` : "Saved to your gallery"}
          </span>
        </div>
      </header>

      {/* Folder navigation (WEB-216) — only when the delivery was foldered. */}
      {folderNames.length > 0 && (
        <nav aria-label="Folders" className="mx-auto flex max-w-6xl flex-wrap gap-1.5 px-5 pt-4">
          <button
            type="button"
            onClick={() => { setActiveFolder(null); setOpen(null); }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${activeFolder === null ? "text-white" : "bg-surface-1 text-ink-muted hover:text-ink"}`}
            style={activeFolder === null ? { background: "var(--accent)" } : undefined}
          >
            All photos
          </button>
          {folderNames.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { setActiveFolder(activeFolder === f ? null : f); setOpen(null); }}
              aria-pressed={activeFolder === f}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${activeFolder === f ? "text-white" : "bg-surface-1 text-ink-muted hover:text-ink"}`}
              style={activeFolder === f ? { background: "var(--accent)" } : undefined}
            >
              {f}
            </button>
          ))}
        </nav>
      )}

      {assets.length === 0 ? (
        <div className="mx-auto max-w-6xl px-5 py-24 text-center text-sm text-ink-subtle">
          Nothing has been shared in this gallery yet — check back soon.
        </div>
      ) : visible.length === 0 ? (
        <div className="mx-auto max-w-6xl px-5 py-24 text-center text-sm text-ink-subtle">
          No photos in this folder.
        </div>
      ) : (
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((a, i) => (
            <button
              key={a.id}
              onClick={() => setOpen(i)}
              className={`group relative aspect-square overflow-hidden rounded-[12px] border bg-surface-1 ${
                picks.has(a.id) ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-hairline"
              }`}
              aria-label={`Open ${a.filename}`}
            >
              {heartsOn && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={favorites.has(a.id) ? `Unfavorite ${a.filename}` : `Favorite ${a.filename}`}
                  aria-pressed={favorites.has(a.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    void heart(a.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      void heart(a.id);
                    }
                  }}
                  className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-colors ${
                    favorites.has(a.id) ? "bg-[var(--accent)] text-white" : "bg-black/35 text-white/85 hover:bg-black/55"
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill={favorites.has(a.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                  </svg>
                </span>
              )}
              {picking && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={picks.has(a.id) ? `Remove ${a.filename} from selection` : `Add ${a.filename} to selection`}
                  aria-pressed={picks.has(a.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePick(a.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePick(a.id);
                    }
                  }}
                  className={`absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 backdrop-blur transition-colors ${
                    picks.has(a.id)
                      ? "border-transparent bg-[var(--accent)] text-white"
                      : "border-white/70 bg-black/30 text-white/80 hover:bg-black/50"
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              )}
              {selectionMode === "selection" && !picking && picks.has(a.id) && (
                <span className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">✓</span>
              )}
              {a.kind === "image" ? (
                <BackoffImage
                  id={a.id}
                  alt={a.filename}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : a.kind === "video" ? (
                <>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption -- gallery video, caption N/A */}
                  {/* WEB-116: poster thumb when the upload generated one; falls
                      back to the video itself with a #t frame hint. */}
                  <video src={`/api/assets/${a.id}?variant=thumb#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white">
                      <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden><path d="M0 0l14 8-14 8z" /></svg>
                    </span>
                  </span>
                </>
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface-2/50 text-ink-tertiary">
                  <FileTypeIcon kind={a.kind} filename={a.filename} className="h-9 w-9" />
                  <span className="text-[10px]">{fmtBytes(a.bytes)}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {selectionMode === "selection" && (
        <div className="sticky bottom-0 z-10 border-t border-hairline bg-canvas/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
            {deadlinePassed ? (
              <span className="text-sm text-ink-subtle">
                {submitted
                  ? `Your selection of ${submitted.items.length} was sent — thanks!`
                  : "The selection deadline has passed."}
              </span>
            ) : (
              <>
                <span className="text-sm font-medium text-ink">
                  {picks.size} picked{selectionLimit ? ` of ${selectionLimit} allowed` : ""}
                </span>
                <span className="text-xs text-ink-tertiary">
                  tap the ✓ on photos to pick{selectionDeadline ? ` · deadline ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(selectionDeadline))}` : ""}
                </span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 500))}
                  placeholder="Note for your photographer (optional)"
                  className="min-w-40 flex-1 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink"
                />
                <button
                  type="button"
                  disabled={busy || !picks.size}
                  onClick={() => void submit()}
                  className="rounded-md px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                >
                  {busy ? "Sending…" : submitted ? "Update selection" : "Send selection"}
                </button>
                {submitted && (
                  <span className="text-xs text-ink-tertiary">
                    last sent {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(submitted.submittedAt))}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {flash && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs text-canvas shadow-lg">
          {flash}
        </div>
      )}

      <footer className="mx-auto max-w-6xl px-5 pb-10 pt-2 text-center text-xs text-ink-tertiary">
        {whiteLabel ? `© ${studioName}` : <>Delivered by {studioName} via Snap</>}
        {!whiteLabel && contactEmail ? <> · <a href={`mailto:${contactEmail}`} className="underline underline-offset-2">Contact the studio</a></> : null}
      </footer>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.filename}
          className="fixed inset-0 z-50 flex flex-col bg-black/92"
          onClick={close}
        >
          <div className="flex items-center gap-3 px-4 py-3 text-white/90" onClick={(e) => e.stopPropagation()}>
            <button onClick={close} aria-label="Close" className="rounded-md p-1.5 hover:bg-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
            <span className="min-w-0 flex-1 truncate text-sm">{open !== null ? `${open + 1} / ${visible.length} · ` : ""}{current.filename}</span>
            {allowDownload && (
              <a
                href={`/api/assets/${current.id}?download=1`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium underline-offset-2 hover:bg-white/10 hover:underline"
                download
              >
                Download
              </a>
            )}
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onClick={close}>
            {visible.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); stepIdx(-1); }}
                aria-label="Previous"
                className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            )}
            {current.kind === "video" ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- gallery video
              <video
                key={current.id}
                src={`/api/assets/${current.id}`}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full"
                onClick={(e) => e.stopPropagation()}
              />
            ) : current.kind === "image" ? (
              <BackoffImage
                key={current.id}
                id={current.id}
                alt={current.filename}
                variant={watermarked ? "preview_wm" : "preview"}
                className="max-h-full max-w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="rounded-[12px] bg-white/5 p-10 text-center text-white/80" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm">{current.filename}</p>
                <p className="mt-1 text-xs text-white/50">{fmtBytes(current.bytes)}</p>
                {allowDownload && (
                  <a href={`/api/assets/${current.id}?download=1`} download className="mt-4 inline-block rounded-lg px-4 py-2 text-xs font-medium text-white" style={{ background: accent }}>
                    Download file
                  </a>
                )}
              </div>
            )}
            {visible.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); stepIdx(1); }}
                aria-label="Next"
                className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
