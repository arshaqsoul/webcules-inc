"use client";

/* Public gallery surface (WEB-125 + WEB-132): the OTP gate, the granted-assets
 * grid + lightbox, and the denied/expired/revoked states. Self-contained
 * styling (no dashboard chrome) — accent comes from the studio's brand. */
import { useCallback, useEffect, useRef, useState } from "react";

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
};

export type GalleryAsset = {
  id: string;
  filename: string;
  kind: string;
  mimeType: string;
  bytes: number;
};

function fmtBytes(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* ---------------- Denied / expired / revoked ---------------- */

export function GalleryDenied({ reason, studioName, contactEmail }: {
  reason: "dead" | "unknown";
  studioName?: string;
  contactEmail?: string | null;
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
        <p className="mt-6 text-xs text-ink-tertiary">Delivered by Snap · snap.webcules.com</p>
      </div>
    </main>
  );
}

/* ---------------- OTP gate ---------------- */

export function GalleryGate({ studioName, accent, logoUrl, token, maskedEmail, turnstileSiteKey }: Brand & {
  token: string;
  maskedEmail: string;
  turnstileSiteKey: string;
}) {
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
          Delivered by Snap · snap.webcules.com
        </p>
      </div>
    </main>
  );
}

/* ---------------- Gallery view ---------------- */

export function GalleryView({ studioName, accent, logoUrl, contactEmail, assets, allowDownload, expiresAt }: Brand & {
  assets: GalleryAsset[];
  allowDownload: boolean;
  expiresAt: string | null;
}) {
  const [open, setOpen] = useState<number | null>(null);

  const close = useCallback(() => setOpen(null), []);
  const stepIdx = useCallback(
    (dir: 1 | -1) => setOpen((cur) => (cur === null ? cur : (cur + dir + assets.length) % assets.length)),
    [assets.length],
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

  const current = open !== null ? assets[open] : null;
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

      {assets.length === 0 ? (
        <div className="mx-auto max-w-6xl px-5 py-24 text-center text-sm text-ink-subtle">
          Nothing has been shared in this gallery yet — check back soon.
        </div>
      ) : (
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((a, i) => (
            <button
              key={a.id}
              onClick={() => setOpen(i)}
              className="group relative aspect-square overflow-hidden rounded-[12px] border border-hairline bg-surface-1"
              aria-label={`Open ${a.filename}`}
            >
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                <img
                  src={`/api/assets/${a.id}`}
                  alt={a.filename}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : a.kind === "video" ? (
                <>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption -- gallery video, caption N/A */}
                  <video src={`/api/assets/${a.id}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white">
                      <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden><path d="M0 0l14 8-14 8z" /></svg>
                    </span>
                  </span>
                </>
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-tertiary">
                  <span className="text-[10px] font-semibold uppercase tracking-widest">{a.kind}</span>
                  <span className="text-[10px]">.{a.filename.split(".").pop()}</span>
                  <span className="text-[10px]">{fmtBytes(a.bytes)}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <footer className="mx-auto max-w-6xl px-5 pb-10 pt-2 text-center text-xs text-ink-tertiary">
        Delivered by {studioName} via Snap
        {contactEmail ? <> · <a href={`mailto:${contactEmail}`} className="underline underline-offset-2">Contact the studio</a></> : null}
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
            <span className="min-w-0 flex-1 truncate text-sm">{open !== null ? `${open + 1} / ${assets.length} · ` : ""}{current.filename}</span>
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
            {assets.length > 1 && (
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
              // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
              <img
                key={current.id}
                src={`/api/assets/${current.id}`}
                alt={current.filename}
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
            {assets.length > 1 && (
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
