"use client";

/* Public gallery surface (WEB-125 + WEB-132): the OTP gate, the granted-assets
 * grid + lightbox, and the denied/expired/revoked states. Self-contained
 * styling (no dashboard chrome) — accent comes from the studio's brand. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FileTypeIcon } from "@/components/file-type-icon";
import { PwaRuntime, queueFavoriteOp, recordFavoriteState } from "@/components/my-pwa";
import { SnapBadge } from "@/components/snap-badge";
import {
  accentInk,
  captionOf,
  columnsVars,
  designColorVars,
  fmtDuration,
  focalPosition,
  fontVars,
  heroImages,
  themeVars,
  type CoverImage,
  type GalleryDesign,
} from "@/lib/gallery-design";
import type { RenderPlan, RenderSection, SectionAsset } from "@/lib/gallery-sections";

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
  /** WEB-243: protection deterrents on gallery media (contextmenu/drag/
   * long-press). Honest scope: deters casual saves, nothing more. */
  deterrents?: boolean;
};

export type GalleryAsset = {
  id: string;
  filename: string;
  kind: string;
  mimeType: string;
  bytes: number;
  /** WEB-216: folder label snapshotted at delivery — the gallery groups by it. */
  folder?: string | null;
  /** WEB-258: intrinsic pixels when known (recorded at upload) — seeds the
   * cascade aspect map without waiting for thumbs to load. */
  width?: number | null;
  height?: number | null;
  /** WEB-260: video duration ms (browser decoder at upload). */
  durationMs?: number | null;
  /** WEB-318: culling stars (0 = unrated) — the rating image binding. */
  stars?: number | null;
  /** WEB-319: direct URLs for sample-pack assets (template harness +
   * preview thumbnails) — set at RUNTIME by the harness, never persisted
   * in a design; absent = the authorized /api/assets proxy as usual. */
  src?: string;
  previewSrc?: string;
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
  /** WEB-319: direct URL override (sample-pack assets) — skips the proxy. */
  srcUrl?: string;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  /** WEB-243: media protection — drag/long-press suppression (deterrents on). */
  protectedMedia?: boolean;
  /** WEB-258: natural-size report (cascade justified rows). */
  onLoaded?: (aspect: number) => void;
  /** WEB-258: inline styles (object-position for cover focal). */
  style?: React.CSSProperties;
}) {
  const [attempt, setAttempt] = useState(0);
  const reported = useRef(false);
  const src = props.srcUrl ?? `/api/assets/${props.id}?variant=${props.variant ?? "thumb"}${attempt ? `&r=${attempt}` : ""}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
    <img
      src={src}
      alt={props.alt}
      loading={props.loading}
      className={props.className}
      style={props.style}
      draggable={props.protectedMedia !== true}
      {...(props.protectedMedia === true
        ? { style: { WebkitTouchCallout: "none", userSelect: "none" } as React.CSSProperties }
        : {})}
      onClick={props.onClick}
      onLoad={(e) => {
        if (reported.current || !props.onLoaded) return;
        reported.current = true;
        const img = e.currentTarget;
        props.onLoaded(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
      }}
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
          {whiteLabel && studioName ? `© ${studioName}` : <SnapBadge medium="gallery">Delivered by Snap · snap.webcules.com</SnapBadge>}
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
          {whiteLabel ? `© ${studioName}` : <SnapBadge medium="gallery">Delivered by Snap · snap.webcules.com</SnapBadge>}
        </p>
      </div>
    </main>
  );
}

/* ---------------- WEB-259: full-screen slideshow ---------------- */

export type SlideshowProps = {
  pace: number;
  transition: "fade" | "kenburns";
  musicUrl: string | null;
  musicStartAt: number;
};

/** WEB-261: downloads — server-resolved controls + approval request list. */
export type DlControls = {
  allowDownload: boolean;
  zip: boolean;
  approval: boolean;
  webSize: boolean;
  limit: number | null;
  limitUsed: number;
  pin: boolean;
};
export type DlRequest = {
  id: string;
  scope: string;
  folderName: string | null;
  sizePref: string;
  state: string;
  fileCount: number | null;
  zipBytes: number | null;
  downloadCount: number;
  createdAt: string;
};

/** Manifest of a streamed download-all (/api/g/{token}/zip). */
export type ZipManifest = {
  files: number;
  bytes: number;
  revision: string;
  label: string;
  parts: { index: number; files: number; bytes: number }[];
  oversize: { id: string; filename: string }[];
};

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.max(1, Math.round(n / 1024 ** 2))} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Hand a URL to the browser's own download manager (streams to disk - no
 * in-memory blob, so a 20 GB wedding is fine). `download` keeps an error
 * response from navigating the gallery away. */
function startBrowserDownload(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Autoplay slideshow: crossfade + optional Ken Burns drift per slide, pace
   * 3/5/8 s, arrows/swipe/keyboard, progress bar, 9:16 vertical (social)
   * mode, optional BYO music streamed from R2. Autoplay-policy-safe: audio
   * starts muted-blocked until a gesture when the browser insists (iOS) —
   * the "tap for sound" pill covers it. Tapping a slide hands off to the
   * lightbox at that photo. Preloads only the next two previews. */
function Slideshow({ slides, startIndex, cfg, watermarked, deterrents, onOpenLightbox, onClose }: {
  slides: { asset: GalleryAsset; lightboxIdx: number }[];
  startIndex: number;
  cfg: SlideshowProps;
  watermarked?: boolean;
  deterrents?: boolean;
  onOpenLightbox: (lightboxIdx: number) => void;
  onClose: () => void;
}) {
  const n = slides.length;
  const [{ idx, fadeFrom }, setSlide] = useState(() => ({
    idx: Math.min(Math.max(0, startIndex), Math.max(0, n - 1)),
    fadeFrom: null as number | null,
  }));
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [vertical, setVertical] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const touchX = useRef<number | null>(null);

  const step = useCallback(
    (dir: 1 | -1) => {
      setSlide((cur) => (n ? { idx: (cur.idx + dir + n) % n, fadeFrom: cur.idx } : cur));
    },
    [n],
  );

  useEffect(() => {
    if (!playing || n < 2) return;
    const t = setInterval(() => step(1), cfg.pace * 1000);
    return () => clearInterval(t);
  }, [playing, cfg.pace, n, step]);

  // Crossfade layer: keep the previous slide mounted briefly under the new one.
  useEffect(() => {
    if (fadeFrom === null) return;
    const t = setTimeout(() => setSlide((cur) => ({ ...cur, fadeFrom: null })), 750);
    return () => clearTimeout(t);
  }, [fadeFrom]);

  // Bandwidth-polite: preload only the next two previews.
  useEffect(() => {
    if (n < 2) return;
    for (const off of [1, 2]) {
      const entry = slides[(idx + off) % n];
      const img = new Image();
      img.src = entry.asset.previewSrc ?? entry.asset.src ?? `/api/assets/${entry.asset.id}?variant=${watermarked ? "preview_wm" : "preview"}`;
    }
  }, [idx, n, slides, watermarked]);

  // Audio follows play/pause + mute; a rejected play() = autoplay policy
  // (iOS Safari) — surface the gesture pill instead of fighting it.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !cfg.musicUrl) return;
    el.muted = muted;
    if (playing) {
      el.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    } else {
      el.pause();
    }
  }, [playing, muted, cfg.musicUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  if (!n) return null;
  const current = slides[idx];
  const previous = fadeFrom !== null ? slides[fadeFrom] : null;
  const slideCls = "absolute inset-0 h-full w-full object-contain";
  const kenburns = cfg.transition === "kenburns";

  const media = (entry: { asset: GalleryAsset }, isCurrent: boolean) =>
    entry.asset.kind === "image" ? (
      <BackoffImage
        id={entry.asset.id}
        alt={entry.asset.filename}
        variant={watermarked ? "preview_wm" : "preview"}
        srcUrl={entry.asset.previewSrc ?? entry.asset.src}
        protectedMedia={deterrents}
        loading="eager"
        className={`${slideCls} ${isCurrent ? "snap-fade-in" : ""} ${isCurrent && kenburns ? "snap-kenburns" : ""}`}
      />
    ) : null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Slideshow" className="fixed inset-0 z-[60] flex flex-col bg-black">
      {cfg.musicUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- music track
        <audio ref={audioRef} src={cfg.musicUrl} loop preload="auto" onLoadedMetadata={(e) => { if (cfg.musicStartAt > 0) e.currentTarget.currentTime = cfg.musicStartAt; }} />
      )}

      <div className="flex items-center gap-2 px-4 py-3 text-white/90">
        <button onClick={onClose} aria-label="Close slideshow" className="rounded-md p-1.5 hover:bg-white/10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-sm">{idx + 1} / {n}</span>
        <button
          type="button"
          onClick={() => setVertical((v) => !v)}
          aria-pressed={vertical}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-white/10"
          title={vertical ? "Full-screen mode" : "Vertical (9:16) — perfect for Stories & Reels"}
        >
          {vertical ? "9:16" : "16:9"}
        </button>
        {cfg.musicUrl && (
          <button
            type="button"
            onClick={() => {
              setMuted((m) => !m);
              setAudioBlocked(false);
            }}
            aria-label={muted ? "Unmute music" : "Mute music"}
            className="rounded-md p-1.5 hover:bg-white/10"
          >
            {muted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="m22 9-6 6M16 9l6 6" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>
            )}
          </button>
        )}
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"} className="rounded-md p-1.5 hover:bg-white/10">
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 14 16" fill="currentColor" aria-hidden><path d="M0 0l14 8-14 8z" /></svg>
          )}
        </button>
      </div>

      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 ${vertical ? "py-0" : ""}`}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 48) step(dx < 0 ? 1 : -1);
        }}
      >
        {n > 1 && (
          <button onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label="Previous photo" className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <div
          className={`relative overflow-hidden ${vertical ? "aspect-[9/16] max-h-full w-auto max-w-full" : "h-full w-full"}`}
          onClick={() => onOpenLightbox(current.lightboxIdx)}
        >
          {previous && media(previous, false)}
          {media(current, true)}
        </div>
        {n > 1 && (
          <button onClick={(e) => { e.stopPropagation(); step(1); }} aria-label="Next photo" className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>

      {audioBlocked && !muted && (
        <button
          type="button"
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            el.muted = false;
            el.play().then(() => setAudioBlocked(false)).catch(() => {});
          }}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-4 py-2 text-xs font-medium text-white backdrop-blur"
        >
          🔊 Tap for sound
        </button>
      )}
      {vertical && <p className="pb-2 text-center text-[11px] text-white/50">Vertical format — record your screen for Stories &amp; Reels</p>}

      <div className="h-1 w-full bg-white/15" role="progressbar" aria-label="Slide progress">
        <span
          key={`${idx}-${playing}`}
          className="snap-progress-bar block h-full bg-white"
          style={{ animationDuration: `${cfg.pace}s`, animationPlayState: playing ? "running" : "paused" }}
        />
      </div>
    </div>
  );
}

/** WEB-260: lightbox video — native controls, plays inline, streams via
 * range requests. A decode failure (HEVC/MOV on a device without the codec)
 * degrades to an honest note instead of a black box. */
function LightboxVideo({ assetId, filename, onFirstPlay }: { assetId: string; filename: string; onFirstPlay: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="rounded-[12px] bg-white/5 px-10 py-8 text-center text-white/80" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium">{filename}</p>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-white/60">
          This video&apos;s format may not play on this device. Ask your photographer for an MP4 (H.264) copy — or download it below if downloads are on.
        </p>
      </div>
    );
  }
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- gallery video
    <video
      src={`/api/assets/${assetId}`}
      controls
      autoPlay
      playsInline
      className="max-h-full max-w-full"
      onError={() => setFailed(true)}
      onPlay={onFirstPlay}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/* ---------------- WEB-258: designed gallery (cover, layouts, theme) ---------------- */

/** Cover hero — three styles, all CSS (Ken Burns is keyframes-only and
 * respects prefers-reduced-motion via the .snap-kenburns class). Space is
 * reserved by aspect wrappers (CLS-safe); the focal point drives
 * object-position. `coverAssetId` is only passed when the cover photo is in
 * this grant's delivered set — otherwise a text-only gradient hero renders. */
/** WEB-301: cover hero slider — CSS scroll-snap carousel over the cover's
 * image list. Swipe on touch, arrows on desktop, dots for position; gentle
 * auto-advance only when configured AND the user allows motion. */
function HeroSlides({
  slides,
  interval,
  kenburns,
  alt,
  deterrents,
}: {
  slides: CoverImage[];
  interval: number;
  kenburns: boolean;
  alt: string;
  deterrents?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!interval || slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      const el = trackRef.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / Math.max(1, el.clientWidth)) + 1) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, interval * 1000);
    return () => clearInterval(timer);
  }, [interval, slides.length]);

  const go = (n: number) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="absolute inset-0">
      <div
        ref={trackRef}
        className="snap-hero-track h-full w-full"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== idx) setIdx(i);
        }}
      >
        {slides.map((slide, i) => (
          <div key={slide.assetId} className="snap-hero-slide h-full w-full" aria-hidden={i !== idx}>
            <BackoffImage
              id={slide.assetId}
              alt={i === 0 ? alt : ""}
              loading={i === 0 ? "eager" : "lazy"}
              variant="preview"
              srcUrl={slide.src}
              protectedMedia={deterrents}
              className={`absolute inset-0 h-full w-full object-cover ${kenburns ? "snap-kenburns" : ""}`}
              style={{ objectPosition: focalPosition(slide.focal) }}
            />
          </div>
        ))}
      </div>
      {/* arrows — desktop pointer affordance */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go((idx - 1 + slides.length) % slides.length)}
            aria-label="Previous cover image"
            className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60 sm:flex"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            type="button"
            onClick={() => go((idx + 1) % slides.length)}
            aria-label="Next cover image"
            className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60 sm:flex"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </button>
          {/* dots — position + jump */}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((slide, i) => (
              <button
                key={slide.assetId}
                type="button"
                onClick={() => go(i)}
                aria-label={`Cover image ${i + 1}`}
                aria-current={i === idx}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function GalleryHero({ design, studioName, coverAssetId, slides, coverSrc, secId }: {
  design: GalleryDesign;
  studioName: string;
  coverAssetId: string | null;
  /** WEB-301: the delivered-set-filtered hero images (slider when 2+). */
  slides?: CoverImage[];
  /** WEB-319: direct URL for the single-image cover (harness/sample assets). */
  coverSrc?: string | null;
  /** WEB-321: builder canvas selection hook. */
  secId?: string;
}) {
  const c = design.cover;
  if (!c) return null;
  const hasText = Boolean(c.title || c.subtitle);
  if (!hasText && !coverAssetId) return null;
  const pos = focalPosition(c.focal);
  const kicker = <span className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80">{studioName}</span>;
  const title = c.title ? <h1 className="mt-2 text-2xl font-semibold leading-tight sm:text-4xl">{c.title}</h1> : null;
  const subtitle = c.subtitle ? <p className="mt-2 max-w-xl text-sm leading-relaxed opacity-85 sm:text-base">{c.subtitle}</p> : null;

  if (c.style === "split") {
    return (
      <section className="w-full" data-sec={secId}>
        <div className="grid @snap-md:grid-cols-[1fr_minmax(300px,38%)]">
          <div className="relative aspect-[4/3] overflow-hidden @snap-md:aspect-auto @snap-md:min-h-[400px]">
            {(slides?.length ?? 0) >= 2 ? (
              <HeroSlides slides={slides!} interval={c.interval ?? 0} kenburns={false} alt={c.title || studioName} />
            ) : coverAssetId ? (
              <BackoffImage
                id={coverAssetId}
                alt={c.title || studioName}
                loading="eager"
                variant="preview"
                srcUrl={coverSrc ?? undefined}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: pos }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_55%,#22222b)] to-[#101014]" />
            )}
            {(coverAssetId || (slides?.length ?? 0) >= 2) && (
              <div className="snap-hero-vignette pointer-events-none absolute inset-0" aria-hidden />
            )}
          </div>
          <div className="flex items-center bg-surface-2 p-7 sm:p-10 @snap-md:min-h-[400px]">
            <div style={{ color: "var(--ink)" }}>
              {kicker}
              {title}
              {subtitle}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const kenburns = c.style === "kenburns";
  return (
    <section className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[21/10]" data-sec={secId}>
      {(slides?.length ?? 0) >= 2 ? (
        <HeroSlides slides={slides!} interval={c.interval ?? 0} kenburns={kenburns} alt={c.title || studioName} deterrents={undefined} />
      ) : coverAssetId ? (
        <BackoffImage
          id={coverAssetId}
          alt={c.title || studioName}
          loading="eager"
          variant="preview"
          srcUrl={coverSrc ?? undefined}
          className={`absolute inset-0 h-full w-full object-cover ${kenburns ? "snap-kenburns" : ""}`}
          style={{ objectPosition: pos }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_55%,#22222b)] to-[#101014]" />
      )}
      {(coverAssetId || (slides?.length ?? 0) >= 2) && (
        <div className="snap-hero-vignette pointer-events-none absolute inset-0" aria-hidden />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-black/10" />
      <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10" style={{ textShadow: HERO_TEXT_SHADOW }}>
        {kicker}
        {title}
        {subtitle}
      </div>
    </section>
  );
}

/** One gallery tile across the three layouts: square (grid), natural-height
 * (masonry), fixed-height justified (cascade). Badges/captions identical. */
function GalleryTile(props: {
  asset: GalleryAsset;
  heartsOn: boolean;
  favorited: boolean;
  picking: boolean;
  picked: boolean;
  pickedLocked: boolean;
  captions: "off" | "hover" | "always";
  radiusCls: string;
  size: "square" | "natural" | "row" | "wide";
  rowAspect?: number;
  deterrents?: boolean;
  /** Per-photo download on hover (images only; hidden when downloads are off). */
  dlOk?: boolean;
  onDownload?: () => void;
  onOpen: () => void;
  onHeart: () => void;
  onPick: () => void;
  onMeasured?: (aspect: number) => void;
}) {
  const { asset: a, size } = props;
  const wrapCls =
    size === "natural"
      ? `group relative block w-full overflow-hidden border bg-surface-1 ${props.radiusCls}`
      : size === "row"
        ? `group relative h-44 overflow-hidden border bg-surface-1 @snap-sm:h-56 @snap-lg:h-64 ${props.radiusCls}`
        : size === "wide"
          ? `group relative aspect-video overflow-hidden border bg-surface-1 ${props.radiusCls}`
          : `group relative aspect-square overflow-hidden border bg-surface-1 ${props.radiusCls}`;
  const duration = props.asset.kind === "video" && props.asset.durationMs ? fmtDuration(props.asset.durationMs) : null;
  const imgCls =
    size === "natural"
      ? "w-full h-auto object-cover"
      : "h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]";
  const caption =
    props.captions === "off" ? null : (
      <span
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-1.5 pt-7 text-[11px] leading-tight text-white transition-opacity ${
          props.captions === "hover" ? "opacity-0 group-hover:opacity-100" : ""
        }`}
      >
        {captionOf(a.filename)}
      </span>
    );
  return (
    <button
      type="button"
      onClick={props.onOpen}
      {...(size === "row" && props.rowAspect ? { style: { flexGrow: props.rowAspect, flexBasis: 0, maxWidth: 560 } as React.CSSProperties } : {})}
      className={`${wrapCls} ${props.picked ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-hairline"}`}
      aria-label={`Open ${a.filename}`}
    >
      {props.heartsOn && (
        <span
          role="button"
          tabIndex={0}
          aria-label={props.favorited ? `Unfavorite ${a.filename}` : `Favorite ${a.filename}`}
          aria-pressed={props.favorited}
          onClick={(e) => {
            e.stopPropagation();
            props.onHeart();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              props.onHeart();
            }
          }}
          className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-colors ${
            props.favorited ? "bg-[var(--accent)] text-white" : "bg-black/35 text-white/85 hover:bg-black/55"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={props.favorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </span>
      )}
      {props.picking && (
        <span
          role="button"
          tabIndex={0}
          aria-label={props.picked ? `Remove ${a.filename} from selection` : `Add ${a.filename} to selection`}
          aria-pressed={props.picked}
          onClick={(e) => {
            e.stopPropagation();
            props.onPick();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              props.onPick();
            }
          }}
          className={`absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 backdrop-blur transition-colors ${
            props.picked
              ? "border-transparent bg-[var(--accent)] text-white"
              : "border-white/70 bg-black/30 text-white/80 hover:bg-black/50"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      )}
      {props.pickedLocked && (
        <span className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">✓</span>
      )}
      {props.dlOk && props.onDownload && a.kind === "image" && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Download ${a.filename}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onDownload?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              props.onDownload?.();
            }
          }}
          className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white/85 opacity-0 backdrop-blur transition-opacity hover:bg-black/55 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
        </span>
      )}
      {a.kind === "image" ? (
        <BackoffImage
          id={a.id}
          alt={a.filename}
          loading="lazy"
          className={imgCls}
          srcUrl={a.src}
          protectedMedia={props.deterrents}
          onLoaded={props.onMeasured}
        />
      ) : a.kind === "video" ? (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- gallery video, caption N/A */}
          {/* WEB-116: poster thumb when the upload generated one; falls
              back to the video itself with a #t frame hint. */}
          <video
            src={`/api/assets/${a.id}?variant=thumb#t=0.5`}
            preload="metadata"
            muted
            playsInline
            className={size === "natural" ? "w-full h-auto object-cover" : "h-full w-full object-cover"}
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white">
              <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden><path d="M0 0l14 8-14 8z" /></svg>
            </span>
          </span>
        </>
      ) : (
        <span className={`flex flex-col items-center justify-center gap-1.5 bg-surface-2/50 text-ink-tertiary ${size === "natural" ? "min-h-40 w-full py-10" : "h-full w-full"}`}>
          <FileTypeIcon kind={a.kind} filename={a.filename} className="h-9 w-9" />
          <span className="text-[10px]">{fmtBytes(a.bytes)}</span>
        </span>
      )}
      {duration && (
        <span className="pointer-events-none absolute bottom-2 right-2 z-[5] rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {duration}
        </span>
      )}
      {caption}
    </button>
  );
}


/* ---------------- WEB-318: sectioned renderer (Template Studio) ---------------- */

/** Everything a section needs from its host gallery — tiles, hearts,
 * lightbox hand-off, brand, theme ramps. Sections never fetch or decide
 * scope on their own: bindings were resolved server-side (lib/gallery-sections). */
type SectionCtx = {
  design: GalleryDesign;
  studioName: string;
  /** Studio accent (the CTA ink computation needs the effective value). */
  accent: string;
  contactEmail: string | null;
  favorites: Set<string>;
  heartsOn: boolean;
  picking: boolean;
  picks: Set<string>;
  pickedLocked: (assetId: string) => boolean;
  radiusCls: string;
  spacing: { gap: string; mb: string; pad: string };
  aspects: Record<string, number>;
  cols: number;
  deterrents?: boolean;
  onOpenAsset: (assetId: string) => void;
  onHeart: (assetId: string) => void;
  /** Per-photo hover download (GalleryTile dlOk). */
  downloadsOn: boolean;
  onDownloadAsset: (assetId: string, filename: string) => void;
  onPick: (assetId: string) => void;
  onMeasured: (assetId: string, aspect: number) => void;
  onStartSlideshow: (assetId: string) => void;
  justifiedRows: (items: { a: GalleryAsset; idx: number }[]) => { a: GalleryAsset; idx: number }[][];
  /** WEB-322: builder mode — collage items become pointer-editable (drag to
   * position, corner to resize, top handle to rotate); edits report through
   * onCollageEdit as normalized percents (the same numbers the renderer
   * draws — one schema, zero drift). Client galleries never set this. */
  builder?: boolean;
  onCollageEdit?: (sectionId: string, index: number, patch: { x?: number; y?: number; w?: number; rotation?: number }) => void;
};

/** WEB-323 founder-review fix: white hero type over bright photos (white
 * dresses, ballrooms, windows) gets a soft shadow so it never washes out. */
const HERO_TEXT_SHADOW = "0 1px 3px rgba(0,0,0,0.55), 0 2px 14px rgba(0,0,0,0.35)";

const SECTION_PAD: Record<string, string> = { compact: "px-4 py-4 @snap-sm:px-6", normal: "px-5 py-8 @snap-sm:px-8", airy: "px-6 py-12 @snap-sm:px-10 @snap-sm:py-16" };
/** Type ramp for sectioned surfaces — sized off --snap-font-scale so the
 * typography editor scales the whole gallery coherently (v1 path untouched). */
const ramp = {
  kicker: 'text-[calc(11px*var(--snap-font-scale,1))] font-semibold uppercase tracking-[0.22em]',
  h2: 'text-[calc(20px*var(--snap-font-scale,1))] font-semibold leading-tight',
  body: 'text-[calc(14.5px*var(--snap-font-scale,1))] leading-relaxed',
};

/** Section band: optional background + horizontal padding; content maxes at
 * the gallery's measure. Hero sections go full-bleed (no band). Every
 * section root carries data-sec={id} — the page builder's canvas uses it
 * for click-to-select and selection outlines (inert for clients). */
function SectionShell({ section, children, wide, ctx }: { section: { id: string; padding?: string; bg?: string }; children: React.ReactNode; wide?: boolean; ctx?: SectionCtx }) {
  const customPalette = Boolean(ctx?.design.theme.colors?.bg);
  const pad = SECTION_PAD[section.padding ?? "normal"] ?? SECTION_PAD.normal;
  // WEB-323 render QA: with a custom page palette, "surface" derives from the
  // page canvas instead of the app's stock ladder, so warm/mono designs stay
  // on-palette.
  const bg =
    section.bg === "surface"
      ? customPalette
        ? "bg-[color-mix(in_srgb,var(--ink)_5%,var(--canvas))]"
        : "bg-surface-1"
      : section.bg === "accent"
        ? "bg-[color-mix(in_srgb,var(--accent)_8%,var(--canvas))]"
        : "";
  // dark: a scoped dark plate (its own ink ladder) so a section can go moody
  // inside a light gallery — same vars the dark theme uses, no bleed.
  const darkVars = section.bg === "dark" ? (themeVars("dark") as React.CSSProperties) : undefined;
  const cls = bg || (section.bg === "dark" ? "bg-[#101014]" : "");
  return (
    <section className={cls || undefined} data-sec={section.id} style={darkVars}>
      <div className={`${wide ? "max-w-7xl" : "max-w-6xl"} mx-auto ${pad}`}>{children}</div>
    </section>
  );
}

function SectionHeading({ text, count }: { text: string; count?: number }) {
  if (!text) return null;
  return (
    <div className="mb-4 flex items-baseline justify-between" style={{ letterSpacing: "var(--snap-tracking, 0)" }}>
      <h2 className={`${ramp.h2} text-ink`}>{text}</h2>
      {count !== undefined && <span className="text-xs text-ink-tertiary">{count} item{count === 1 ? "" : "s"}</span>}
    </div>
  );
}

/** v2 hero — static/kenburns/split reuse the WEB-258 GalleryHero verbatim
 * (same markup, same behavior); fullbleed is the v2 statement hero
 * (edge-to-edge 21/9, scrim, centered display type, no vignette). */
function HeroSectionView({ section, slides, ctx }: { section: Extract<RenderSection, { kind: "hero" }>["section"]; slides: CoverImage[]; ctx: SectionCtx }) {
  const kicker = section.kicker ? (
    <span className={`${ramp.kicker} opacity-80`} style={{ color: "var(--ink)" }}>
      {ctx.studioName}
    </span>
  ) : null;

  if (section.style === "fullbleed") {
    return (
      <section className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[21/9]" data-sec={section.id}>
        {slides.length >= 2 ? (
          <HeroSlides slides={slides} interval={section.interval} kenburns={false} alt={section.title || ctx.studioName} deterrents={ctx.deterrents} />
        ) : slides[0] ? (
          <BackoffImage
            id={slides[0].assetId}
            alt={section.title || ctx.studioName}
            loading="eager"
            variant="preview"
            srcUrl={slides[0].src}
            protectedMedia={ctx.deterrents}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: focalPosition(slides[0].focal) }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_55%,#22222b)] to-[#101014]" />
        )}
        {/* WEB-323 render QA: the mid scrim keeps centered display type
         * readable over bright hero photos (white dresses, windows). */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white" style={{ letterSpacing: "var(--snap-tracking, 0)", textShadow: HERO_TEXT_SHADOW }}>
          {kicker && <span className={`${ramp.kicker} opacity-90`}>{ctx.studioName}</span>}
          {section.title && <h1 className="mt-3 text-[calc(30px*var(--snap-font-scale,1))] font-semibold leading-tight sm:text-[calc(44px*var(--snap-font-scale,1))]">{section.title}</h1>}
          {section.subtitle && <p className="mt-3 max-w-xl text-[calc(15px*var(--snap-font-scale,1))] leading-relaxed opacity-90">{section.subtitle}</p>}
        </div>
      </section>
    );
  }

  if (!section.kicker) {
    // kicker-less variant of the static/kenburns hero (otherwise GalleryHero)
    const kenburns = section.style === "kenburns";
    return (
      <section className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[21/10]" data-sec={section.id}>
        {slides.length >= 2 ? (
          <HeroSlides slides={slides} interval={section.interval} kenburns={kenburns} alt={section.title || ctx.studioName} deterrents={ctx.deterrents} />
        ) : slides[0] ? (
          <BackoffImage
            id={slides[0].assetId}
            alt={section.title || ctx.studioName}
            loading="eager"
            variant="preview"
            srcUrl={slides[0].src}
            protectedMedia={ctx.deterrents}
            className={`absolute inset-0 h-full w-full object-cover ${kenburns ? "snap-kenburns" : ""}`}
            style={{ objectPosition: focalPosition(slides[0].focal) }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_55%,#22222b)] to-[#101014]" />
        )}
        {slides.length > 0 && <div className="snap-hero-vignette pointer-events-none absolute inset-0" aria-hidden />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10" style={{ letterSpacing: "var(--snap-tracking, 0)", textShadow: HERO_TEXT_SHADOW }}>
          {section.title && <h1 className="text-[calc(24px*var(--snap-font-scale,1))] font-semibold leading-tight sm:text-[calc(36px*var(--snap-font-scale,1))]">{section.title}</h1>}
          {section.subtitle && <p className="mt-2 max-w-xl text-[calc(14.5px*var(--snap-font-scale,1))] leading-relaxed opacity-85">{section.subtitle}</p>}
        </div>
      </section>
    );
  }

  return (
    <GalleryHero
      design={{
        layout: "grid",
        theme: ctx.design.theme,
        cover: {
          assetId: slides[0]?.assetId ?? "",
          focal: slides[0]?.focal ?? { x: 0.5, y: 0.5 },
          style: section.style === "split" ? "split" : section.style === "kenburns" ? "kenburns" : "static",
          title: section.title,
          subtitle: section.subtitle,
          ...(slides.length >= 2 ? { images: slides, interval: section.interval } : {}),
        },
      }}
      studioName={ctx.studioName}
      coverAssetId={slides[0]?.assetId ?? null}
      coverSrc={slides[0]?.src ?? null}
      slides={slides.length >= 2 ? slides : undefined}
      secId={section.id}
    />
  );
}

/** One bound gallery section — the same three layouts as the v1 grid,
 * rendered through the same GalleryTile (hearts, picking, captions, films
 * behavior all identical; entitlements live in the tile host, not here). */
function GallerySectionView({ section, assets, ctx }: { section: Extract<RenderSection, { kind: "gallery" }>["section"]; assets: SectionAsset[]; ctx: SectionCtx }) {
  const entries = assets.map((a) => ({ a: a as GalleryAsset, idx: 0 }));
  const tile = (a: GalleryAsset, size: "square" | "natural" | "row", rowAspect?: number) => (
    <GalleryTile
      key={a.id}
      asset={a}
      size={size}
      rowAspect={rowAspect}
      heartsOn={ctx.heartsOn}
      favorited={ctx.favorites.has(a.id)}
      picking={ctx.picking}
      picked={ctx.picks.has(a.id)}
      pickedLocked={ctx.pickedLocked(a.id)}
      captions={ctx.design.theme.captions}
      radiusCls={ctx.radiusCls}
      deterrents={ctx.deterrents}
      dlOk={ctx.downloadsOn}
      onDownload={ctx.downloadsOn ? () => ctx.onDownloadAsset(a.id, a.filename) : undefined}
      onOpen={() => ctx.onOpenAsset(a.id)}
      onHeart={() => ctx.onHeart(a.id)}
      onPick={() => ctx.onPick(a.id)}
      onMeasured={size === "row" ? (aspect) => ctx.onMeasured(a.id, aspect) : undefined}
    />
  );
  return (
    <SectionShell section={section} ctx={ctx}>
      <SectionHeading text={section.heading ?? ""} count={section.binding.kind === "all" ? undefined : assets.length} />
      {assets.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-tertiary">
          {section.binding.kind === "picks" ? "Your photographer is curating this selection — check back soon." : "Nothing in this part of the gallery yet."}
        </p>
      ) : (
        <div style={columnsVars({ columns: section.columns }) as React.CSSProperties}>          {section.layout === "grid" && <div className={`snap-grid ${ctx.spacing.gap}`}>{entries.map(({ a }) => tile(a, "square"))}</div>}
          {section.layout === "masonry" && (
            <div className={`snap-masonry ${ctx.spacing.gap}`}>
              {entries.map(({ a }) => (
                <div key={a.id} className={ctx.spacing.mb}>{tile(a, "natural")}</div>
              ))}
            </div>
          )}
          {section.layout === "cascade" && (
            <div className={`flex flex-col ${ctx.spacing.gap}`}>
              {ctx.justifiedRows(entries).map((row, ri) => (
                <div key={ri} className={`flex ${ctx.spacing.gap}`}>
                  {row.map(({ a }) => tile(a, "row", ctx.aspects[a.id] ?? 1))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

/** WEB-259 launcher section — a poster strip that opens the full-screen
 * slideshow at the first bound photo. */
function SlideshowSectionView({ section, assets, ctx }: { section: Extract<RenderSection, { kind: "slideshow" }>["section"]; assets: SectionAsset[]; ctx: SectionCtx }) {
  if (!assets.length) return null;
  const posters = assets.slice(0, section.posters);
  return (
    <SectionShell section={section} ctx={ctx}>
      <SectionHeading text={section.heading ?? ""} />
      <button
        type="button"
        onClick={() => ctx.onStartSlideshow(assets[0].id)}
        className="group relative block w-full overflow-hidden rounded-[16px] border border-hairline"
        aria-label={`Play slideshow (${assets.length} photos)`}
      >
        <div className="grid grid-cols-2 gap-0.5 @snap-sm:grid-cols-4">
          {posters.map((a) => (
            <span key={a.id} className="relative block aspect-[4/3] overflow-hidden bg-surface-1">
              <BackoffImage id={a.id} alt="" srcUrl={a.src} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" protectedMedia={ctx.deterrents} />
            </span>
          ))}
          {posters.length < 4 && Array.from({ length: 4 - posters.length }).map((_, i) => <span key={`fill-${i}`} className="aspect-[4/3] bg-surface-2" />)}
        </div>
        <span className="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[1px] transition-colors group-hover:bg-black/35">
          <span className="flex items-center gap-2.5 rounded-full bg-white/95 px-5 py-2.5 text-sm font-semibold text-[#111] shadow-lg">
            <svg width="13" height="15" viewBox="0 0 14 16" fill="currentColor" aria-hidden><path d="M0 0l14 8-14 8z" /></svg>
            Play slideshow · {assets.length} photos
          </span>
        </span>
      </button>
    </SectionShell>
  );
}

/** Live favorites — the client's hearted photos right now (WEB-264 lists
 * stay in the host header; this grid follows the active list). */
function FavoritesSectionView({ section, assets, ctx, fallbackHeading }: { section: Extract<RenderSection, { kind: "favorites" }>["section"]; assets: GalleryAsset[]; ctx: SectionCtx; fallbackHeading?: string }) {
  const favs = assets.filter((a) => ctx.favorites.has(a.id) && a.kind === "image");
  return (
    <SectionShell section={section} ctx={ctx}>
      <SectionHeading text={section.heading ?? fallbackHeading ?? "Your favorites"} count={favs.length || undefined} />
      {favs.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-hairline-strong px-6 py-10 text-center text-sm text-ink-tertiary">
          {section.emptyHint?.trim() || "Tap the ♥ on photos you love — they'll appear here for you (and your photographer)."}
        </p>
      ) : (
        <div className={`snap-grid ${ctx.spacing.gap}`}>
          {favs.map((a) => (
            <GalleryTile
              key={a.id}
              asset={a}
              size="square"
              heartsOn={ctx.heartsOn}
              favorited
              picking={ctx.picking}
              picked={ctx.picks.has(a.id)}
              pickedLocked={ctx.pickedLocked(a.id)}
              captions={ctx.design.theme.captions}
              radiusCls={ctx.radiusCls}
              deterrents={ctx.deterrents}
              dlOk={ctx.downloadsOn}
              onDownload={ctx.downloadsOn ? () => ctx.onDownloadAsset(a.id, a.filename) : undefined}
              onOpen={() => ctx.onOpenAsset(a.id)}
              onHeart={() => ctx.onHeart(a.id)}
              onPick={() => ctx.onPick(a.id)}
            />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

/** One pointer-editable collage item in builder mode: drag body = position,
 * corner handle = width, top handle = rotation (clamped ±15°). Deltas are
 * measured against the section box and reported as the same normalized
 * percents the renderer consumes. */
function CollageItemEditable({ it, index, section, ctx, box }: {
  it: (RenderSection & { kind: "collage" })["items"][number];
  index: number;
  section: Extract<RenderSection, { kind: "collage" }>["section"];
  ctx: SectionCtx;
  box: HTMLElement;
}) {
  const start = useRef<{ mode: "move" | "size" | "rotate"; x0: number; y0: number; item: typeof it; cx: number; cy: number } | null>(null);
  const onPointerDown = (mode: "move" | "size" | "rotate") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    start.current = { mode, x0: e.clientX, y0: e.clientY, item: it, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const s = start.current;
      if (!s || !ctx.onCollageEdit) return;
      const rect2 = box.getBoundingClientRect();
      const dxPct = ((ev.clientX - s.x0) / rect2.width) * 100;
      const dyPct = ((ev.clientY - s.y0) / rect2.height) * 100;
      if (s.mode === "move") {
        ctx.onCollageEdit(section.id, index, {
          x: Math.round(Math.min(100 - 8, Math.max(0, s.item.x + dxPct)) * 10) / 10,
          y: Math.round(Math.min(100 - 8, Math.max(0, s.item.y + dyPct)) * 10) / 10,
        });
      } else if (s.mode === "size") {
        ctx.onCollageEdit(section.id, index, { w: Math.round(Math.min(100, Math.max(8, s.item.w + dxPct)) * 10) / 10 });
      } else {
        const a0 = Math.atan2(s.y0 - s.cy, s.x0 - s.cx);
        const a1 = Math.atan2(ev.clientY - s.cy, ev.clientX - s.cx);
        const deg = s.item.rotation + ((a1 - a0) * 180) / Math.PI;
        ctx.onCollageEdit(section.id, index, { rotation: Math.round(Math.min(15, Math.max(-15, deg)) * 10) / 10 });
      }
    };
    const up = () => {
      start.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      className="group absolute block overflow-hidden border border-hairline bg-surface-1 ring-1 ring-transparent hover:ring-[var(--accent)]"
      style={{ left: `${it.x}%`, top: `${it.y}%`, width: `${it.w}%`, transform: it.rotation ? `rotate(${it.rotation}deg)` : undefined, zIndex: it.z, aspectRatio: "4 / 5", cursor: "grab" }}
      onPointerDown={onPointerDown("move")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- builder canvas */}
      <img src={`/api/assets/${it.assetId}?variant=thumb`} alt={it.asset.filename} className="pointer-events-none h-full w-full select-none object-cover" style={{ objectPosition: focalPosition(it.focal) }} draggable={false} />
      <span aria-hidden className="absolute -right-0 -bottom-0 h-3.5 w-3.5 cursor-nwse-resize rounded-tl bg-[var(--accent)]" onPointerDown={onPointerDown("size")} />
      <span aria-hidden className="absolute -top-0 left-1/2 h-3.5 w-3.5 -translate-x-1/2 cursor-grab rounded-b bg-[var(--accent)]/80" onPointerDown={onPointerDown("rotate")} title="rotate" />
    </div>
  );
}

/** Free-positioned collage — percent-absolute items over the section box;
 * the aspect wrapper reserves space (CLS-safe) and the same numbers scale
 * phone → desktop. mobileStack swaps in a simple grid below sm instead. */
function CollageSectionView({ section, items, ctx }: { section: Extract<RenderSection, { kind: "collage" }>["section"]; items: (RenderSection & { kind: "collage" })["items"]; ctx: SectionCtx }) {
  const boxRef = useRef<HTMLDivElement>(null);
  if (!items.length) return null;
  const collage = (className: string) => (
    <div ref={boxRef} className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: section.aspect.replace("/", " / ") }}>
      {items.map((it, i) =>
        ctx.builder && boxRef.current ? (
          <CollageItemEditable key={`${it.assetId}-${i}`} it={it} index={i} section={section} ctx={ctx} box={boxRef.current} />
        ) : (
        <button
          key={it.assetId}
          type="button"
          onClick={() => ctx.onOpenAsset(it.assetId)}
          aria-label={`Open ${it.asset.filename}`}
          className="group absolute block overflow-hidden border border-hairline bg-surface-1"
          style={{
            left: `${it.x}%`,
            top: `${it.y}%`,
            width: `${it.w}%`,
            transform: it.rotation ? `rotate(${it.rotation}deg)` : undefined,
            zIndex: it.z,
            aspectRatio: "4 / 5",
          }}
        >
          <BackoffImage
            id={it.assetId}
            alt={it.asset.filename}
            srcUrl={it.asset.src}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            style={{ objectPosition: focalPosition(it.focal) }}
            protectedMedia={ctx.deterrents}
          />
        </button>
        ),
      )}
    </div>
  );
  if (!section.mobileStack) return <SectionShell section={section} ctx={ctx}>{collage(ctx.radiusCls)}</SectionShell>;
  return (
    <SectionShell section={section} ctx={ctx}>
      {/* stacked below sm (readability floor), collage from sm up — one schema, two responsive renders */}
      <div className={`grid grid-cols-2 gap-2 sm:hidden ${ctx.spacing.gap}`}>
        {items.map((it) => (
          <button key={it.assetId} type="button" onClick={() => ctx.onOpenAsset(it.assetId)} className={`block aspect-[4/5] overflow-hidden border border-hairline bg-surface-1 ${ctx.radiusCls}`} aria-label={`Open ${it.asset.filename}`}>
            <BackoffImage id={it.assetId} alt={it.asset.filename} srcUrl={it.asset.src} className="h-full w-full object-cover" style={{ objectPosition: focalPosition(it.focal) }} protectedMedia={ctx.deterrents} />
          </button>
        ))}
      </div>
      <div className="hidden sm:block">{collage(ctx.radiusCls)}</div>
    </SectionShell>
  );
}

/** Sanitized rich text (WEB-247 allowlist ran at parse) — merge fields were
 * rendered server-side before this component sees the html. */
function TextSectionView({ section, ctx }: { section: Extract<RenderSection, { kind: "text" }>["section"]; ctx: SectionCtx }) {
  if (!section.html) return null;
  return (
    <SectionShell section={section} ctx={ctx}>
      <div
        className={`gallery-prose ${section.width === "wide" ? "max-w-4xl" : "max-w-2xl"} ${section.align === "center" ? "mx-auto text-center" : ""} text-ink`}
        style={{ letterSpacing: "var(--snap-tracking, 0)", ["--snap-prose-scale" as string]: "var(--snap-font-scale, 1)" }}
        // eslint-disable-next-line react/no-danger -- sanitized at parse (lib/sanitize allowlist)
        dangerouslySetInnerHTML={{ __html: section.html }}
      />
    </SectionShell>
  );
}

/** Studio contact / CTA card — merge-rendered copy + accent CTA. */
function ContactSectionView({ section, ctx }: { section: Extract<RenderSection, { kind: "contact" }>["section"]; ctx: SectionCtx }) {
  const href = section.ctaHref ?? (ctx.contactEmail ? `mailto:${ctx.contactEmail}` : null);
  // WEB-323 render QA: surfaces follow a custom page palette (derived from
  // --canvas, not the app's cool surface ladder), corners follow the theme
  // radius token, and the CTA label picks its ink from the effective accent.
  const customPalette = Boolean(ctx.design.theme.colors?.bg);
  const surfaceCls = customPalette ? "bg-[color-mix(in_srgb,var(--ink)_5%,var(--canvas))]" : "bg-surface-1";
  const cardCls = ctx.design.theme.radius === "0px" ? "rounded-none" : ctx.design.theme.radius === "8px" ? "rounded-[8px]" : "rounded-[16px]";
  const pillCls = ctx.design.theme.radius === "0px" ? "rounded-none" : "rounded-full";
  return (
    <SectionShell section={section} ctx={ctx}>
      <div className={`mx-auto max-w-2xl ${cardCls} border border-hairline ${surfaceCls} p-8 text-center sm:p-10`} style={{ letterSpacing: "var(--snap-tracking, 0)" }}>
        <span className={`${ramp.kicker} text-ink-tertiary`}>{ctx.studioName}</span>
        {section.heading && <h2 className={`${ramp.h2} mt-3 text-ink`}>{section.heading}</h2>}
        {section.body && <p className={`${ramp.body} mt-3 text-ink-subtle`}>{section.body}</p>}
        {href && (
          <a
            href={href}
            className={`mt-6 inline-block ${pillCls} px-6 py-2.5 text-sm font-semibold transition-[filter] hover:brightness-110`}
            style={{ background: "var(--accent)", color: accentInk(ctx.design.theme.colors?.accent ?? ctx.accent) }}
          >
            {section.ctaLabel?.trim() || ctx.contactEmail || "Get in touch"}
          </a>
        )}
      </div>
    </SectionShell>
  );
}

/** The nav bar (WEB-318): client-side view tabs — no routing, theme-aware,
 * respects the studio's white-label (it never carries Snap identity). */
function GalleryNav({ items, view, onView }: { items: ("gallery" | "favorites" | "info")[]; view: string; onView: (v: "gallery" | "favorites" | "info") => void }) {
  const labels = { gallery: "Gallery", favorites: "Favorites", info: "Info" } as const;
  return (
    <nav aria-label="Gallery views" className="sticky top-[57px] z-[9] border-b border-hairline bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl gap-1 px-5 pt-2" role="tablist">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            onClick={() => onView(item)}
            className={`-mb-px border-b-2 px-3.5 pb-2.5 pt-1 text-[13px] font-medium transition-colors ${
              view === item ? "border-[var(--accent)] text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {labels[item]}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function GalleryView({ studioName, accent, logoUrl, contactEmail, whiteLabel, watermarked, deterrents, assets, allowDownload, expiresAt, selectionMode, selectionLimit, selectionDeadline, initialFavorites, submittedSelection, clientToken, design, plan, fontFamily, builder, onCollageEdit, slideshow, allowSharing, favoriteLists = [], initialNotes = {}, canMakeLists, canNote, projectTitle, eventDate, welcomeImageUrl, welcomeBanner }: Brand & {
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
  /** WEB-258: gallery design (cover/layout/theme) — null = classic look. */
  design?: GalleryDesign | null;
  /** WEB-318: sectioned render plan (bindings resolved server-side against
   * the delivered set). Present = the sectioned renderer owns the page; the
   * v1 cover+grid surface is bypassed (and v1 configs, which never produce a
   * plan, render through it pixel-identical as before). */
  plan?: RenderPlan | null;
  /** WEB-318/319: CSS font-family stack resolved from theme.font against
   * the self-hosted pack — null = system stack. */
  fontFamily?: string | null;
  /** WEB-322: builder mode — collage items become pointer-editable. */
  builder?: boolean;
  /** WEB-322: collage edit callback (normalized percents). */
  onCollageEdit?: (sectionId: string, index: number, patch: { x?: number; y?: number; w?: number; rotation?: number }) => void;
  /** WEB-259: slideshow (server-resolved: Free tier arrives musicless). */
  slideshow?: SlideshowProps | null;
  /** WEB-262: per-photo sharing allowed (Lite+ AND the studio toggle). */
  allowSharing?: boolean;
  /** WEB-264: favorite lists (first = active) + per-photo notes for it. */
  favoriteLists?: { id: string; name: string }[];
  initialNotes?: Record<string, string>;
  canMakeLists?: boolean;
  canNote?: boolean;
  /** WEB-301 WP-A: display strings for the zero-config default hero. */
  projectTitle?: string | null;
  eventDate?: string | null;
  /** Welcome collage the photographer attached to this gallery (signed path). */
  welcomeImageUrl?: string | null;
  /** Show the welcome image as the first thing on the gallery (opt-in). */
  welcomeBanner?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  // WEB-259: slideshow start index into the photos-only slide list.
  const [slideshowStart, setSlideshowStart] = useState<number | null>(null);
  // WEB-264: favorite lists — hearts operate on the active list.
  const [lists, setLists] = useState(favoriteLists);
  const [activeListId, setActiveListId] = useState(favoriteLists[0]?.id ?? null);
  const [favNotes, setFavNotes] = useState<Record<string, string>>(initialNotes);
  const [newListName, setNewListName] = useState("");
  const [listBusy, setListBusy] = useState(false);
  // WEB-260: the video already counted a view this session (per lightbox).
  const countedVideo = useRef<string | null>(null);
  // WEB-261: downloads 2.0 — controls + request list from the server.
  const [dl, setDl] = useState<{ requests: DlRequest[]; controls: DlControls } | null>(null);
  const [dlMenuOpen, setDlMenuOpen] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlFlash, setDlFlash] = useState("");
  const [pinPrompt, setPinPrompt] = useState<{ retry: () => void } | null>(null);
  // Download-all split into several archives (> 2 GB galleries): the parts sheet.
  const [zipSheet, setZipSheet] = useState<{ manifest: ZipManifest; qs: string; started: number[] } | null>(null);
  const [pinValue, setPinValue] = useState("");
  // WEB-262: native share sheet (fallback menu) for the current lightbox photo.
  const [shareSheet, setShareSheet] = useState<{ url: string } | null>(null);

  const refreshDownloads = useCallback(async () => {
    try {
      const res = await fetch(`/api/g/${clientToken}/download-request`);
      if (!res.ok) return;
      setDl((await res.json()) as { requests: DlRequest[]; controls: DlControls });
    } catch {
      // downloads UI is progressive enhancement — never block the gallery
    }
  }, [clientToken]);
  useEffect(() => {
    void refreshDownloads();
  }, [refreshDownloads]);

  /** Fetch a download as a blob (so a 401 pin_required can open the PIN
   * modal instead of silently failing) and save it. */
  const downloadVia = useCallback(
    async (url: string, fallbackName: string) => {
      setDlBusy(true);
      try {
        const res = await fetch(url);
        if (res.status === 401 && ((await res.json().catch(() => ({}))) as { error?: string }).error === "pin_required") {
          setDlBusy(false);
          setPinPrompt({ retry: () => void downloadVia(url, fallbackName) });
          return;
        }
        if (!res.ok) {
          setDlFlash(res.status === 403 ? "You've reached the download limit for this gallery — your photographer can lift it." : "Download failed — try again.");
          setTimeout(() => setDlFlash(""), 4000);
          return;
        }
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fallbackName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      } catch {
        setDlFlash("Network error — try again.");
        setTimeout(() => setDlFlash(""), 3000);
      }
      setDlBusy(false);
    },
    [],
  );

  /** Download-all: resolve the plan, then hand the browser a streaming URL
   * per part. Galleries that need studio approval file a request instead. */
  async function requestZip(scope: "all" | "folder" | "favorites", sizePref: "full" | "web") {
    setDlMenuOpen(false);
    if (dl?.controls.approval) return fileApprovalRequest(scope, sizePref);
    const qs = new URLSearchParams({ scope, size: sizePref });
    if (scope === "folder" && activeFolder) qs.set("folder", activeFolder);
    await pullZip(qs.toString());
  }

  async function pullZip(qs: string) {
    setDlBusy(true);
    try {
      const res = await fetch(`/api/g/${clientToken}/zip?${qs}`);
      const body = (await res.json().catch(() => ({}))) as Partial<ZipManifest> & { error?: string };
      if (res.status === 401 && body.error === "pin_required") {
        setDlBusy(false);
        setPinPrompt({ retry: () => void pullZip(qs) });
        return;
      }
      if (!res.ok || !body.parts) {
        setDlFlash(
          body.error === "empty_scope" ? "Nothing to download in that selection yet."
          : body.error === "zip_rate_limited" ? "That's a lot of downloads today - try again in a while."
          : body.error === "approval_required" || body.error === "awaiting_approval" ? "Your photographer needs to approve this download first."
          : "Couldn't start the download - try again.",
        );
        setTimeout(() => setDlFlash(""), 4500);
        setDlBusy(false);
        return;
      }
      const manifest = body as ZipManifest;
      if (manifest.parts.length === 1) {
        startBrowserDownload(`/api/g/${clientToken}/zip?${qs}&part=1&v=${manifest.revision}`);
        setDlFlash(`Your download is starting - ${manifest.files} file${manifest.files === 1 ? "" : "s"}, ${formatBytes(manifest.bytes)}.`);
        setTimeout(() => setDlFlash(""), 5000);
      } else {
        setZipSheet({ manifest, qs, started: [] });
      }
    } catch {
      setDlFlash("Network error - try again.");
      setTimeout(() => setDlFlash(""), 3000);
    }
    setDlBusy(false);
  }

  function pullPart(index: number) {
    if (!zipSheet) return;
    startBrowserDownload(`/api/g/${clientToken}/zip?${zipSheet.qs}&part=${index}&v=${zipSheet.manifest.revision}`);
    setZipSheet((cur) => (cur ? { ...cur, started: [...new Set([...cur.started, index])] } : cur));
  }

  function pullAllParts() {
    if (!zipSheet) return;
    // Spaced out so browsers treat them as one deliberate batch.
    zipSheet.manifest.parts.forEach((p, i) => setTimeout(() => pullPart(p.index), i * 1500));
  }

  async function fileApprovalRequest(scope: "all" | "folder" | "favorites", sizePref: "full" | "web") {
    setDlBusy(true);
    try {
      const res = await fetch(`/api/g/${clientToken}/download-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          ...(scope === "folder" ? { folderName: activeFolder } : {}),
          sizePref,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; state?: string; error?: string };
      if (!res.ok || !body.id) {
        setDlFlash(
          body.error === "too_many_active" ? "Too many pending requests - wait for your photographer to answer one."
          : body.error === "empty_scope" ? "Nothing to download in that selection yet."
          : "Couldn't request the download - try again.",
        );
      } else {
        setDlFlash("Request sent - your photographer will approve it shortly, and we'll email you.");
        await refreshDownloads();
      }
    } catch {
      setDlFlash("Network error - try again.");
    }
    setTimeout(() => setDlFlash(""), 5000);
    setDlBusy(false);
  }

  async function sharePhoto(assetId: string) {
    try {
      const res = await fetch(`/api/g/${clientToken}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setDlFlash(body.error === "rate_limited" ? "That's a lot of sharing today — try again tomorrow." : "Couldn't create the share link — try again.");
        setTimeout(() => setDlFlash(""), 3500);
        return;
      }
      const shareData = { title: studioName, text: `A photo from ${studioName}`, url: body.url };
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share(shareData);
          return;
        } catch {
          // user dismissed or the sheet failed — fall through to the menu
        }
      }
      setShareSheet({ url: body.url });
    } catch {
      setDlFlash("Network error — try again.");
      setTimeout(() => setDlFlash(""), 3000);
    }
  }

  async function switchList(id: string) {
    if (id === activeListId) return;
    setListBusy(true);
    try {
      const res = await fetch(`/api/g/${clientToken}/lists?active=${id}`);
      if (res.ok) {
        const body = (await res.json()) as { favorites: string[] };
        setFavorites(new Set(body.favorites));
        setActiveListId(id);
        setOpen(null);
      }
    } catch {
      // stay on the current list
    }
    setListBusy(false);
  }

  async function addList() {
    const name = newListName.trim();
    if (!name || listBusy) return;
    setListBusy(true);
    try {
      const res = await fetch(`/api/g/${clientToken}/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string; error?: string };
      if (res.ok && body.id) {
        setLists((cur) => [...cur, { id: body.id!, name: body.name ?? name }]);
        setNewListName("");
        await switchList(body.id);
      } else {
        setDlFlash(body.error === "lists_require_lite" ? "Multiple lists are a Lite feature." : "Couldn't create the list.");
        setTimeout(() => setDlFlash(""), 3000);
      }
    } catch {
      setDlFlash("Network error — try again.");
      setTimeout(() => setDlFlash(""), 3000);
    }
    setListBusy(false);
  }

  async function saveNote(assetId: string, note: string) {
    if (!activeListId) return;
    try {
      const res = await fetch(`/api/g/${clientToken}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, listId: activeListId, note }),
      });
      if (res.ok) setFavNotes((cur) => ({ ...cur, [assetId]: note }));
    } catch {
      // notes are best-effort on the client side
    }
  }

  async function verifyPin() {
    if (!pinPrompt) return;
    setDlBusy(true);
    try {
      const res = await fetch(`/api/g/${clientToken}/download-request/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinValue }),
      });
      if (res.ok) {
        const retry = pinPrompt.retry;
        setPinPrompt(null);
        setPinValue("");
        retry();
      } else {
        setDlFlash("That PIN isn't right — try again.");
        setTimeout(() => setDlFlash(""), 3000);
      }
    } catch {
      setDlFlash("Network error — try again.");
      setTimeout(() => setDlFlash(""), 3000);
    }
    setDlBusy(false);
  }
  const [favorites, setFavorites] = useState<Set<string>>(new Set(initialFavorites));
  const [picks, setPicks] = useState<Set<string>>(new Set(submittedSelection?.items ?? []));
  const [submitted, setSubmitted] = useState<{ items: string[]; note: string | null; submittedAt: string } | null>(submittedSelection);
  const [note, setNote] = useState(submittedSelection?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  // WEB-216: folder navigation — null = all photos. Favorites/selection stay
  // gallery-wide; only the grid + lightbox walk the visible slice.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  // WEB-258 cascade: aspect map (id → w/h) seeded from stored dimensions,
  // refined lazily as unmeasured thumbs load; unknown tiles assume square.
  const [aspects, setAspects] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const a of assets) {
      if (a.width && a.height) seed[a.id] = Math.min(2.4, Math.max(0.45, a.width / a.height));
    }
    return seed;
  });
  const [cols, setCols] = useState(4);
  // Measures the gallery's own width — the preview phone shell renders the
  // gallery in a ~420px frame on a desktop viewport, so window.innerWidth
  // would pick desktop column counts inside a phone-narrow box.
  const galRef = useRef<HTMLDivElement>(null);
  // WEB-318: nav view tabs — client state only, never routing.
  const [view, setView] = useState<"gallery" | "favorites" | "info">("gallery");

  const layout = design?.layout ?? "grid";
  const themed = Boolean(design);
  const padding = design?.theme.padding ?? "normal";
  // Phones pin the photo gaps at the 4px floor (pictures carry the layout);
  // the template's designed spacing returns once the GALLERY is tablet-wide —
  // @snap-sm keys off the gallery container, so the preview's phone shell on
  // a desktop viewport still shows the phone values.
  const spacing = {
    compact: { gap: "gap-1 @snap-sm:gap-2", mb: "mb-1 @snap-sm:mb-2", pad: "p-3" },
    normal: { gap: "gap-1 @snap-sm:gap-3", mb: "mb-1 @snap-sm:mb-3", pad: "p-4 @snap-sm:p-5" },
    airy: { gap: "gap-1 @snap-sm:gap-5", mb: "mb-1 @snap-sm:mb-5", pad: "p-5 @snap-sm:p-10" },
  }[padding];
  const radiusCls = design ? ({ "0px": "rounded-none", "8px": "rounded-[8px]", "16px": "rounded-[16px]" } as const)[design.theme.radius] : "rounded-[12px]";
  const captions = design?.theme.captions ?? "off";

  useEffect(() => {
    if (layout !== "cascade") return;
    const el = galRef.current;
    if (!el) return;
    const c = design?.columns;
    const compute = () => {
      const w = el.clientWidth;
      setCols(w >= 1024 ? (c?.md ?? 4) : w >= 640 ? (c?.sm ?? 3) : (c?.mobile ?? 2));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, design?.columns]);

  const measureAspect = useCallback((id: string, aspect: number) => {
    setAspects((cur) => (cur[id] ? cur : { ...cur, [id]: Math.min(2.4, Math.max(0.45, aspect)) }));
  }, []);

  const folderNames = Array.from(new Set(assets.map((a) => a.folder).filter((f): f is string => Boolean(f))));
  // WEB-318: sectioned designs own the page — no folder pills, no filter.
  const visible = plan ? assets : activeFolder ? assets.filter((a) => a.folder === activeFolder) : assets;
  // WEB-259: photos in delivery order; each carries its lightbox index so a
  // slideshow tap hands off to the lightbox at the same photo.
  const slideEntries = useMemo(
    () => visible.map((asset, lightboxIdx) => ({ asset, lightboxIdx })).filter((e) => e.asset.kind === "image"),
    [visible],
  );

  // WEB-258: designed galleries group folders as section headers (the
  // folderless block leads without one). Classic mode stays a flat grid.
  // Tiles carry their flat index into `visible` — the lightbox walks that.
  const filmsOn = Boolean(design?.films) && assets.some((a) => a.kind === "video");
  const sections = useMemo(() => {
    // WEB-260: with the Films flag, videos leave the photo flow entirely —
    // they render in a dedicated Films section (reels strip first).
    const photosOf = (list: { a: GalleryAsset; idx: number }[]) => (filmsOn ? list.filter((e) => e.a.kind !== "video") : list);
    const all = visible.map((a, idx) => ({ a, idx }));
    const films = filmsOn ? all.filter((e) => e.a.kind === "video") : [];
    // WEB-301 WP-A: foldered deliveries group even without a saved design —
    // the default look gets real section dividers, not a flat anonymous grid.
    if (!themed && folderNames.length === 0) {
      return [...(photosOf(all).length ? [{ name: null as string | null, items: photosOf(all) }] : []), ...(films.length ? [{ name: "Films" as string | null, items: films, films: true }] : [])];
    }
    if (activeFolder) {
      return [...(photosOf(all).length ? [{ name: null as string | null, items: photosOf(all) }] : []), ...(films.length ? [{ name: "Films" as string | null, items: films, films: true }] : [])];
    }
    const byFolder = new Map<string | null, { a: GalleryAsset; idx: number }[]>();
    photosOf(all).forEach((entry) => {
      const key = entry.a.folder ?? null;
      const list = byFolder.get(key) ?? [];
      list.push(entry);
      byFolder.set(key, list);
    });
    const loose = byFolder.get(null) ?? [];
    return [
      ...(loose.length ? [{ name: null as string | null, items: loose }] : []),
      ...folderNames.map((f) => ({ name: f as string | null, items: byFolder.get(f) ?? [] })),
      ...(films.length ? [{ name: "Films" as string | null, items: films, films: true }] : []),
    ];
  }, [themed, activeFolder, visible, folderNames, filmsOn]);

  // WEB-260: vertical clips (h/w ≥ 1.5, dims known) get the reels treatment.
  const reels = useMemo(
    () => (filmsOn ? visible.filter((a) => a.kind === "video" && a.width && a.height && a.height / a.width >= 1.5) : []),
    [filmsOn, visible],
  );

  // Justified ("cascade") rows: close a row once its accumulated aspect
  // reaches the target fill for the current column count; flex-grow per tile
  // keeps rows flush at any container width (no JS layout lib, no measure
  // of the container — only the photos' own aspect ratios).
  const justifiedRows = useCallback(
    (items: { a: GalleryAsset; idx: number }[]): { a: GalleryAsset; idx: number }[][] => {
      const target = cols * 1.08;
      const rows: { a: GalleryAsset; idx: number }[][] = [];
      let row: { a: GalleryAsset; idx: number }[] = [];
      let sum = 0;
      for (const it of items) {
        const ar = aspects[it.a.id] ?? 1;
        row.push(it);
        sum += ar;
        if (sum >= target) {
          rows.push(row);
          row = [];
          sum = 0;
        }
      }
      if (row.length) rows.push(row);
      return rows;
    },
    [aspects, cols],
  );

  const deadlinePassed = selectionDeadline !== null && selectionDeadline < Date.now();
  const heartsOn = selectionMode !== "off";
  const picking = selectionMode === "selection" && !deadlinePassed;

  async function heart(assetId: string) {
    const next = new Set(favorites);
    if (next.has(assetId)) next.delete(assetId);
    else next.add(assetId);
    setFavorites(next);
    const desired = !favorites.has(assetId);
    recordFavoriteState(clientToken, assetId, desired);
    try {
      const res = await fetch(`/api/g/${clientToken}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, favorited: desired, ...(activeListId ? { listId: activeListId } : {}) }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { favorited: boolean };
      recordFavoriteState(clientToken, assetId, body.favorited);
      setFavorites((cur) => {
        const fixed = new Set(cur);
        if (body.favorited) fixed.add(assetId);
        else fixed.delete(assetId);
        return fixed;
      });
    } catch {
      // WEB-263: offline (or flaky) — keep the local heart and replay on
      // reconnect; the server op is an idempotent set.
      queueFavoriteOp(clientToken, assetId);
      setFlash(desired ? "Saved offline — will sync when you're back." : "Removed offline — will sync when you're back.");
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

  // WEB-318: hand-off helpers for the sectioned renderer.
  const openAsset = useCallback((assetId: string) => {
    const idx = visible.findIndex((a) => a.id === assetId);
    if (idx >= 0) setOpen(idx);
  }, [visible]);
  const startSlideshowAt = useCallback(
    (assetId: string) => {
      const i = slideEntries.findIndex((e) => e.asset.id === assetId);
      if (i >= 0) setSlideshowStart(i);
    },
    [slideEntries],
  );

  const sectionCtx: SectionCtx | null =
    plan && design
      ? {
          design,
          studioName,
          accent,
          contactEmail,
          favorites,
          heartsOn,
          picking,
          picks,
          pickedLocked: (assetId) => selectionMode === "selection" && !picking && picks.has(assetId),
          radiusCls,
          spacing,
          aspects,
          cols,
          deterrents,
          onOpenAsset: openAsset,
          onHeart: (id) => void heart(id),
          downloadsOn: allowDownload,
          onDownloadAsset: (id, filename) => void downloadVia(`/api/assets/${id}?download=1`, filename),
          onPick: togglePick,
          onMeasured: measureAspect,
          onStartSlideshow: startSlideshowAt,
          justifiedRows,
          builder,
          onCollageEdit,
        }
      : null;

  /** One section → its component (the nav-less single scroll renders every
   * kind in order; nav views pre-filter, below). */
  const renderSection = (rs: RenderSection): React.ReactNode => {
    if (!sectionCtx) return null;
    switch (rs.kind) {
      case "hero":
        return <HeroSectionView key={rs.section.id} section={rs.section} slides={rs.slides} ctx={sectionCtx} />;
      case "gallery":
        return <GallerySectionView key={rs.section.id} section={rs.section} assets={rs.assets} ctx={sectionCtx} />;
      case "slideshow":
        return <SlideshowSectionView key={rs.section.id} section={rs.section} assets={rs.assets} ctx={sectionCtx} />;
      case "favorites":
        return <FavoritesSectionView key={rs.section.id} section={rs.section} assets={assets} ctx={sectionCtx} />;
      case "collage":
        return <CollageSectionView key={rs.section.id} section={rs.section} items={rs.items} ctx={sectionCtx} />;
      case "text":
        return <TextSectionView key={rs.section.id} section={rs.section} ctx={sectionCtx} />;
      case "contact":
        return <ContactSectionView key={rs.section.id} section={rs.section} ctx={sectionCtx} />;
    }
  };

  // WEB-318: what each nav view shows. Gallery keeps the visual sections;
  // Info is text+contact; Favorites renders the live hearts grid (from the
  // favorites section when authored, sensible defaults otherwise).
  // favorites sections need hearts (selectionMode); without them the section is a dead end
  const gallerySections = plan
    ? plan.sections.filter(
        (s) =>
          s.kind === "hero" ||
          s.kind === "gallery" ||
          s.kind === "slideshow" ||
          s.kind === "collage" ||
          (s.kind === "favorites" ? !plan.nav?.enabled && heartsOn : !plan.nav?.enabled && (s.kind === "text" || s.kind === "contact")),
      )
    : [];
  const infoSections = plan ? plan.sections.filter((s) => s.kind === "text" || s.kind === "contact") : [];
  const favoritesSection = plan?.sections.find((s) => s.kind === "favorites")?.section ?? null;
  const defaultFavorites: Extract<RenderSection, { kind: "favorites" }>["section"] = { type: "favorites", id: "sec-favorites-default", heading: "", emptyHint: undefined };
  const defaultContact: Extract<RenderSection, { kind: "contact" }>["section"] = { type: "contact", id: "sec-contact-default", heading: "Get in touch" };


  return (
    <main
      className="min-h-screen bg-canvas"
      style={
        {
          ["--accent" as string]: accent,
          ...(design ? themeVars(design.theme.background) : {}),
          ...designColorVars(design),
          ...fontVars(design, fontFamily ?? null),
          ...columnsVars(design),
          // WEB-318/319: the resolved pack font consumes its var here —
          // everything inside the gallery inherits it.
          ...(fontFamily ? { fontFamily: "var(--snap-font)" } : {}),
        } as React.CSSProperties
      }
      onContextMenu={(e) => {
        // WEB-243: deterrent on MEDIA only — UI chrome keeps the normal menu.
        if (deterrents && (e.target as HTMLElement).tagName === "IMG") e.preventDefault();
      }}
    >
      <PwaRuntime enabled />
      {/* The gallery's own container: every responsive ladder inside (grid /
       * masonry columns, gaps, section padding, cascade rows) keys off THIS
       * width via container queries, so the preview phone shell on a desktop
       * viewport renders exactly like a real phone. Fixed overlays (lightbox,
       * dialogs, slideshows) stay outside it — layout containment would trap
       * their viewport positioning. */}
      <div className="snap-gallery" ref={galRef}>
      {design && !plan && (
        <GalleryHero
          design={design}
          studioName={studioName}
          coverAssetId={design.cover?.assetId && assets.some((a) => a.id === design.cover?.assetId) ? design.cover.assetId : null}
          slides={heroImages(design).filter((i) => assets.some((a) => a.id === i.assetId))}
        />
      )}
      {!design && !plan && (projectTitle || assets.length > 0) && (
        /* WEB-301 WP-A: the zero-config gallery still opens on an intentional
         * hero — same renderer, default text-only design (scrim + display
         * type + meta line). Configured galleries above are untouched. */
        <GalleryHero
          design={{
            layout: "grid",
            theme: { background: "light", padding: "normal", radius: "16px", captions: "off" },
            cover: {
              assetId: "",
              focal: { x: 0.5, y: 0.5 },
              style: "static",
              title: projectTitle?.trim() || "Your gallery",
              subtitle: [
                eventDate,
                `${assets.filter((a) => a.kind === "image").length} photo${assets.filter((a) => a.kind === "image").length === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" · "),
            },
          }}
          studioName={studioName}
          coverAssetId={null}
        />
      )}
      <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/90 backdrop-blur">
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
          {dl?.controls.allowDownload && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDlMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
                aria-expanded={dlMenuOpen}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                Download
              </button>
              {dlMenuOpen && (
                <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-[12px] border border-hairline bg-surface-1 p-3 shadow-lg" style={{ colorScheme: "light" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Download all</p>
                  <button type="button" disabled={dlBusy} onClick={() => void requestZip("all", "full")} className="mt-1.5 w-full rounded-md bg-surface-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface-3 disabled:opacity-60">
                    Everything · full resolution
                  </button>
                  {dl.controls.webSize && (
                    <button type="button" disabled={dlBusy} onClick={() => void requestZip("all", "web")} className="mt-1.5 w-full rounded-md bg-surface-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface-3 disabled:opacity-60">
                      Everything · web size (2048px)
                    </button>
                  )}
                  {activeFolder && (
                    <button type="button" disabled={dlBusy} onClick={() => void requestZip("folder", "full")} className="mt-1.5 w-full rounded-md bg-surface-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface-3 disabled:opacity-60">
                      Just “{activeFolder}”
                    </button>
                  )}
                  {heartsOn && (
                    <button type="button" disabled={dlBusy} onClick={() => void requestZip("favorites", "full")} className="mt-1.5 w-full rounded-md bg-surface-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface-3 disabled:opacity-60">
                      My favorites ({favorites.size})
                    </button>
                  )}
                  {dl.controls.approval ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-tertiary">Your photographer approves bulk downloads first - we'll email you the moment it is.</p>
                  ) : (
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-tertiary">Starts right away. Big galleries arrive as a few ZIP parts.</p>
                  )}
                  {dl.controls.limit !== null && (
                    <p className="mt-2 border-t border-hairline pt-2 text-[11px] text-ink-tertiary">
                      {Math.max(0, dl.controls.limit - dl.controls.limitUsed)} of {dl.controls.limit} downloads left
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {slideshow && slideEntries.length > 0 && (
            <button
              type="button"
              onClick={() => setSlideshowStart(0)}
              className="flex items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 14 16" fill="currentColor" aria-hidden><path d="M0 0l14 8-14 8z" /></svg>
              Slideshow
            </button>
          )}
          <span className="ml-auto text-xs text-ink-tertiary">
            {expiry ? `Link expires ${expiry}` : "Saved to your gallery"}
          </span>
        </div>
      </header>

      {/* Welcome collage the photographer attached - the same picture that heads the email. */}
      {welcomeImageUrl && welcomeBanner && (
        <div className="mx-auto max-w-6xl px-5 pt-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed route, no optimizer */}
          <img src={welcomeImageUrl} alt={`A welcome from ${studioName}`} className="mx-auto block max-h-[70vh] w-auto max-w-full rounded-[14px] border border-hairline object-contain" />
        </div>
      )}

      {/* WEB-264: favorite lists — pills + create (Lite+). */}
      {heartsOn && (lists.length > 1 || canMakeLists) && (
        <nav aria-label="Favorite lists" className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-5 pt-3">
          {lists.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => void switchList(l.id)}
              disabled={listBusy}
              aria-pressed={activeListId === l.id}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${activeListId === l.id ? "text-white" : "bg-surface-1 text-ink-muted hover:text-ink"}`}
              style={activeListId === l.id ? { background: "var(--accent)" } : undefined}
            >
              {l.name}
            </button>
          ))}
          {canMakeLists && (
            <span className="flex items-center gap-1">
              <input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value.slice(0, 60))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addList();
                  }
                }}
                placeholder="New list…"
                className="w-28 rounded-full border border-hairline bg-canvas px-3 py-1.5 text-xs text-ink placeholder:text-ink-tertiary"
              />
              <button
                type="button"
                onClick={() => void addList()}
                disabled={listBusy || !newListName.trim()}
                className="rounded-full bg-surface-1 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
              >
                Add
              </button>
            </span>
          )}
        </nav>
      )}

      {/* WEB-318: view tabs (no routing) — only for sectioned designs with nav on. */}
      {plan?.nav?.enabled && plan.nav.items.length > 0 && (
        <GalleryNav items={plan.nav.items.filter((i) => i !== "favorites" || heartsOn)} view={view} onView={setView} />
      )}

      {/* Folder navigation (WEB-216) — only when the delivery was foldered.
       * Sectioned designs replace folder pills with bound sections. */}
      {!plan && folderNames.length > 0 && (
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

      {plan && sectionCtx ? (
        /* WEB-318: the sectioned page — nav views partition the sections;
         * without nav everything renders as one ordered scroll. */
        view === "favorites" && heartsOn ? (
          <FavoritesSectionView section={favoritesSection ?? defaultFavorites} assets={assets} ctx={sectionCtx} fallbackHeading="Your favorites" />
        ) : view === "info" ? (
          <>
            {infoSections.length ? (
              infoSections.map(renderSection)
            ) : (
              <ContactSectionView section={defaultContact} ctx={sectionCtx} />
            )}
          </>
        ) : (
          <>{gallerySections.map(renderSection)}</>
        )
      ) : assets.length === 0 ? (
        <div className="mx-auto max-w-6xl px-5 py-24 text-center text-sm text-ink-subtle">
          Nothing has been shared in this gallery yet — check back soon.
        </div>
      ) : visible.length === 0 ? (
        <div className="mx-auto max-w-6xl px-5 py-24 text-center text-sm text-ink-subtle">
          No photos in this folder.
        </div>
      ) : (
        <div className={`mx-auto max-w-6xl ${spacing.pad} ${themed ? "space-y-10" : ""}`}>
          {sections.map((section) => (
            <section key={section.name ?? "__loose"} aria-label={section.name ?? undefined}>
              {section.name && !themed && (
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="shrink-0 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{section.name}</h2>
                  <span className="h-px flex-1 bg-hairline" aria-hidden />
                  <span className="shrink-0 text-xs text-ink-tertiary">{section.items.length}</span>
                </div>
              )}
              {section.name && themed && (
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-[15px] font-medium text-ink">{section.name}</h2>
                  <span className="flex items-center gap-2 text-xs text-ink-tertiary">
                    {section.items.length} item{section.items.length === 1 ? "" : "s"}
                    {slideshow && (
                      <button
                        type="button"
                        onClick={() => {
                          const first = section.items.find((it) => it.a.kind === "image");
                          if (first) setSlideshowStart(slideEntries.findIndex((e) => e.asset.id === first.a.id));
                        }}
                        className="rounded-full bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink"
                      >
                        ▶ Play
                      </button>
                    )}
                  </span>
                </div>
              )}
              {"films" in section && section.films && (
                <div className="flex flex-col gap-4">
                  {reels.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-ink-tertiary">Reels</p>
                      <div className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
                        {reels.map((a) => {
                          const i = visible.indexOf(a);
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setOpen(i)}
                              aria-label={`Play reel ${a.filename}`}
                              className={`group relative aspect-[9/16] w-28 shrink-0 snap-start overflow-hidden border border-hairline bg-surface-1 sm:w-36 ${radiusCls}`}
                            >
                              <video src={`/api/assets/${a.id}?variant=thumb#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                              <span className="absolute inset-0 flex items-center justify-center">
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white">
                                  <svg width="12" height="14" viewBox="0 0 14 16" fill="currentColor" aria-hidden><path d="M0 0l14 8-14 8z" /></svg>
                                </span>
                              </span>
                              {a.durationMs ? (
                                <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{fmtDuration(a.durationMs)}</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
                    {section.items
                      .filter((it) => !reels.some((r) => r.id === it.a.id))
                      .map(({ a, idx }) => (
                        <GalleryTile
                          key={a.id}
                          asset={a}
                          size="wide"
                          heartsOn={heartsOn}
                          favorited={favorites.has(a.id)}
                          picking={picking}
                          picked={picks.has(a.id)}
                          pickedLocked={selectionMode === "selection" && !picking && picks.has(a.id)}
                          captions={captions}
                          radiusCls={radiusCls}
                          deterrents={deterrents}
                          dlOk={allowDownload}
                          onDownload={allowDownload ? () => void downloadVia(`/api/assets/${a.id}?download=1`, a.filename) : undefined}
                          onOpen={() => setOpen(idx)}
                          onHeart={() => void heart(a.id)}
                          onPick={() => togglePick(a.id)}
                        />
                      ))}
                  </div>
                </div>
              )}
              {!("films" in section) && layout === "grid" && (
                <div className={`snap-grid ${spacing.gap}`}>
                  {section.items.map(({ a, idx }) => (
                    <GalleryTile
                      key={a.id}
                      asset={a}
                      size="square"
                      heartsOn={heartsOn}
                      favorited={favorites.has(a.id)}
                      picking={picking}
                      picked={picks.has(a.id)}
                      pickedLocked={selectionMode === "selection" && !picking && picks.has(a.id)}
                      captions={captions}
                      radiusCls={radiusCls}
                      deterrents={deterrents}
                      dlOk={allowDownload}
                      onDownload={allowDownload ? () => void downloadVia(`/api/assets/${a.id}?download=1`, a.filename) : undefined}
                      onOpen={() => setOpen(idx)}
                      onHeart={() => void heart(a.id)}
                      onPick={() => togglePick(a.id)}
                    />
                  ))}
                </div>
              )}
              {!("films" in section) && layout === "masonry" && (
                <div className={`snap-masonry ${spacing.gap}`}>
                  {section.items.map(({ a, idx }) => (
                    <div key={a.id} className={spacing.mb}>
                      <GalleryTile
                        asset={a}
                        size="natural"
                        heartsOn={heartsOn}
                        favorited={favorites.has(a.id)}
                        picking={picking}
                        picked={picks.has(a.id)}
                        pickedLocked={selectionMode === "selection" && !picking && picks.has(a.id)}
                        captions={captions}
                        radiusCls={radiusCls}
                        deterrents={deterrents}
                        dlOk={allowDownload}
                        onDownload={allowDownload ? () => void downloadVia(`/api/assets/${a.id}?download=1`, a.filename) : undefined}
                        onOpen={() => setOpen(idx)}
                        onHeart={() => void heart(a.id)}
                        onPick={() => togglePick(a.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
              {!("films" in section) && layout === "cascade" && (
                <div className={`flex flex-col ${spacing.gap}`}>
                  {justifiedRows(section.items).map((row, ri) => (
                    <div key={ri} className={`flex ${spacing.gap}`}>
                      {row.map(({ a, idx }) => (
                        <GalleryTile
                          key={a.id}
                          asset={a}
                          size="row"
                          rowAspect={aspects[a.id] ?? 1}
                          heartsOn={heartsOn}
                          favorited={favorites.has(a.id)}
                          picking={picking}
                          picked={picks.has(a.id)}
                          pickedLocked={selectionMode === "selection" && !picking && picks.has(a.id)}
                          captions={captions}
                          radiusCls={radiusCls}
                          deterrents={deterrents}
                          dlOk={allowDownload}
                          onDownload={allowDownload ? () => void downloadVia(`/api/assets/${a.id}?download=1`, a.filename) : undefined}
                          onOpen={() => setOpen(idx)}
                          onHeart={() => void heart(a.id)}
                          onPick={() => togglePick(a.id)}
                          onMeasured={(aspect) => measureAspect(a.id, aspect)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {selectionMode === "selection" && (
        <div className="sticky bottom-0 z-20 border-t border-hairline bg-canvas/95 backdrop-blur">
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

      {dl && dl.requests.length > 0 && (
        <div className="mx-auto max-w-6xl px-5 pt-3">
          {dl.requests.slice(0, 2).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-hairline bg-surface-1 px-4 py-3 text-sm">
              {r.state === "approved" || r.state === "delivered" ? (
                <>
                  <span className="text-ink">{r.state === "approved" ? "Approved" : "Approved - download again anytime"}{r.fileCount ? ` - ${r.fileCount} file${r.fileCount === 1 ? "" : "s"}` : ""}</span>
                  <button
                    type="button"
                    disabled={dlBusy}
                    onClick={() => void pullZip(`req=${r.id}`)}
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ background: "var(--accent)" }}
                  >
                    Download
                  </button>
                </>
              ) : r.state === "requested" ? (
                <span className="text-ink-subtle">Download requested - waiting for your photographer's approval.</span>
              ) : (
                <span className="text-ink-subtle">Your photographer declined this download request{r.scope === "favorites" ? " - individual favorites still download from the full-screen view" : ""}.</span>
              )}
            </div>
          ))}
        </div>
      )}

      </div>

      {shareSheet && (
        <div role="dialog" aria-modal="true" aria-label="Share this photo" className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setShareSheet(null)}>
          <div className="w-full max-w-sm rounded-[16px] bg-surface-1 p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-ink">Share this photo</p>
            <p className="mt-1 truncate text-xs text-ink-tertiary">{shareSheet.url}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(shareSheet.url);
                  setShareSheet(null);
                  setDlFlash("Link copied ✓");
                  setTimeout(() => setDlFlash(""), 2500);
                }}
                className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface-3"
              >
                Copy link
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent("Look at this photo ") + encodeURIComponent(shareSheet.url)}`} target="_blank" rel="noreferrer" className="rounded-lg bg-surface-2 px-3 py-2.5 text-center text-sm font-medium text-ink hover:bg-surface-3">
                WhatsApp
              </a>
              <a href={`mailto:?subject=${encodeURIComponent("A photo from " + studioName)}&body=${encodeURIComponent(shareSheet.url)}`} className="rounded-lg bg-surface-2 px-3 py-2.5 text-center text-sm font-medium text-ink hover:bg-surface-3">
                Email
              </a>
              <button type="button" onClick={() => setShareSheet(null)} className="rounded-lg border border-hairline px-3 py-2.5 text-sm text-ink-muted">
                Close
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-tertiary">Anyone with the link sees this photo (watermarked if your gallery uses watermarks). The link lives as long as the gallery does.</p>
          </div>
        </div>
      )}

      {zipSheet && (
        <div role="dialog" aria-modal="true" aria-label="Download in parts" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setZipSheet(null)}>
          <div className="w-full max-w-md rounded-[16px] bg-surface-1 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink">Your download comes in {zipSheet.manifest.parts.length} parts</h2>
            <p className="mt-1 text-sm text-ink-subtle">
              {zipSheet.manifest.files} files · {formatBytes(zipSheet.manifest.bytes)}. Smaller ZIPs open everywhere and a hiccup only costs one part. Unzip them all into the same folder.
            </p>
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {zipSheet.manifest.parts.map((p) => (
                <li key={p.index} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <span className="text-ink">Part {p.index} <span className="text-ink-tertiary">· {p.files} files · {formatBytes(p.bytes)}</span></span>
                  <button type="button" onClick={() => pullPart(p.index)} className="rounded-md px-3 py-1 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>
                    {zipSheet.started.includes(p.index) ? "Again" : "Download"}
                  </button>
                </li>
              ))}
            </ul>
            {zipSheet.manifest.oversize.length > 0 && (
              <p className="mt-3 text-[11px] leading-relaxed text-ink-tertiary">
                {zipSheet.manifest.oversize.length} very large file{zipSheet.manifest.oversize.length === 1 ? "" : "s"} can't go in a ZIP - download {zipSheet.manifest.oversize.length === 1 ? "it" : "them"} from the full-screen view.
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setZipSheet(null)} className="flex-1 rounded-lg border border-hairline px-4 py-2 text-sm text-ink-muted">
                Close
              </button>
              <button type="button" onClick={pullAllParts} className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
                Download all parts
              </button>
            </div>
          </div>
        </div>
      )}

      {pinPrompt && (
        <div role="dialog" aria-modal="true" aria-label="Enter download PIN" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-[16px] bg-surface-1 p-6">
            <h2 className="text-base font-semibold text-ink">Enter the download PIN</h2>
            <p className="mt-1 text-sm text-ink-subtle">Your photographer set a PIN for downloads — it's in their message.</p>
            <input
              inputMode="numeric"
              maxLength={8}
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="mt-4 w-full rounded-lg border border-hairline-strong bg-canvas px-3 py-2.5 text-center text-xl tracking-[0.4em] text-ink outline-none focus:border-[var(--accent)]"
            />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => { setPinPrompt(null); setPinValue(""); }} className="flex-1 rounded-lg border border-hairline px-4 py-2 text-sm text-ink-muted">
                Cancel
              </button>
              <button type="button" disabled={dlBusy || pinValue.length < 4} onClick={() => void verifyPin()} className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
                {dlBusy ? "Checking…" : "Unlock downloads"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dlFlash && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs text-canvas shadow-lg">
          {dlFlash}
        </div>
      )}

      {flash && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs text-canvas shadow-lg">
          {flash}
        </div>
      )}

      <footer className="mx-auto max-w-6xl px-5 pb-10 pt-2 text-center text-xs text-ink-tertiary">
        {whiteLabel ? `© ${studioName}` : <>Delivered by {studioName} via <SnapBadge medium="gallery-photo">Snap</SnapBadge></>}
        {!whiteLabel && contactEmail ? <> · <a href={`mailto:${contactEmail}`} className="underline underline-offset-2">Contact the studio</a></> : null}
      </footer>

      {slideshow && slideshowStart !== null && slideEntries.length > 0 && (
        <Slideshow
          slides={slideEntries}
          startIndex={slideshowStart}
          cfg={slideshow}
          watermarked={watermarked}
          deterrents={deterrents}
          onOpenLightbox={(lightboxIdx) => {
            setSlideshowStart(null);
            setOpen(lightboxIdx);
          }}
          onClose={() => setSlideshowStart(null)}
        />
      )}

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
            {allowSharing && current.kind === "image" && (
              <button
                type="button"
                onClick={() => void sharePhoto(current.id)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium underline-offset-2 hover:bg-white/10 hover:underline"
                title="Share this photo"
              >
                Share
              </button>
            )}
            {allowDownload && (
              <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  disabled={dlBusy}
                  onClick={() => void downloadVia(`/api/assets/${current.id}?download=1`, current.filename)}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium underline-offset-2 hover:bg-white/10 hover:underline disabled:opacity-60"
                >
                  Download
                </button>
                {dl?.controls.webSize && current.kind === "image" && (
                  <button
                    type="button"
                    disabled={dlBusy}
                    onClick={() => void downloadVia(`/api/assets/${current.id}?download=1&size=web`, current.filename)}
                    className="rounded-md px-2.5 py-1.5 text-xs text-white/70 underline-offset-2 hover:bg-white/10 hover:underline disabled:opacity-60"
                    title="2048px web size — great for sharing"
                  >
                    Web
                  </button>
                )}
              </span>
            )}
          </div>

          {canNote && activeListId && current.kind === "image" && favorites.has(current.id) && (
            <div className="flex items-center gap-2 px-4 pb-1" onClick={(e) => e.stopPropagation()}>
              <input
                key={current.id}
                defaultValue={favNotes[current.id] ?? ""}
                onBlur={(e) => void saveNote(current.id, e.target.value.slice(0, 280))}
                placeholder="Note for your photographer (optional) — e.g. the one for grandma"
                className="w-full max-w-xl rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white placeholder:text-white/40"
              />
            </div>
          )}
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
              <LightboxVideo
                key={current.id}
                assetId={current.id}
                filename={current.filename}
                onFirstPlay={() => {
                  // WEB-260: one playback session = one counted view — the
                  // beacon is a no-cache thumb GET (scrubbing ranges stay
                  // exempt, so seeking never multiplies the count).
                  if (countedVideo.current === current.id) return;
                  countedVideo.current = current.id;
                  void fetch(`/api/assets/${current.id}?variant=thumb&r=${Date.now()}`);
                }}
              />
            ) : current.kind === "image" ? (
              <BackoffImage
                key={current.id}
                id={current.id}
                alt={current.filename}
                variant={watermarked ? "preview_wm" : "preview"}
                srcUrl={current.previewSrc ?? current.src}
                protectedMedia={deterrents}
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
