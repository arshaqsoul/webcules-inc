"use client";

/* WEB-263: the /my email gate — one code, remembered device. Mirrors the
 * gallery OTP gate's two-step flow (with optional Turnstile). */

import { useEffect, useRef, useState } from "react";

export function MyGate({ studioHint, turnstileSiteKey }: { studioHint: string; turnstileSiteKey: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [tsToken, setTsToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const tsRef = useRef<HTMLDivElement>(null);
  const tsIdRef = useRef<string | null>(null);

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
      const w = window as unknown as { turnstile?: { render: (el: string | HTMLElement, opts: { sitekey: string; callback: (t: string) => void }) => string } };
      if (cancelled || tsIdRef.current || !w.turnstile || !tsRef.current) return;
      tsIdRef.current = w.turnstile.render(tsRef.current, { sitekey: turnstileSiteKey, callback: (t) => setTsToken(t) });
    };
    tryRender();
    const iv = setInterval(() => {
      if (tsIdRef.current) return clearInterval(iv);
      tryRender();
    }, 400);
    return () => { cancelled = true; clearInterval(iv); };
  }, [turnstileSiteKey]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/my/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: tsToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!body.ok) {
        setError(
          body.error === "invalid_email" ? "No galleries found for that email — check the address your photographer used."
          : body.error === "captcha_failed" ? "Please complete the verification check."
          : body.error === "rate_limited" ? "Too many codes requested — try again in a few minutes."
          : body.error === "email_failed" ? "We couldn't send the email — please try again."
          : "Something went wrong — please try again.",
        );
      } else {
        setStep("code");
        setCooldown(30);
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
      const res = await fetch("/api/my/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (body.ok) window.location.reload();
      else {
        setError("That code isn't right — check the latest email and try again.");
        setCode("");
      }
    } catch {
      setError("Network error — please try again.");
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-[16px] border border-hairline bg-surface-1 p-8">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{studioHint}</span>
        <h1 className="mt-3 text-xl font-semibold text-ink">Your photos, all in one place</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">
          {step === "email" ? (
            <>Enter the email your photographer sends galleries to — we&apos;ll send a one-time code.</>
          ) : (
            <>We sent a code to <span className="font-medium text-ink">{email}</span>. It expires in 10 minutes.</>
          )}
        </p>
        <form
          className="mt-6 flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === "email") void send();
            else void verify();
          }}
        >
          {step === "email" && (
            <>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-hairline-strong bg-canvas px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary"
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
              className="w-full rounded-lg border border-hairline-strong bg-canvas px-3.5 py-2.5 text-center text-xl tracking-[0.5em] text-ink outline-none focus:border-primary"
            />
          )}
          {error && <p className="text-xs leading-relaxed text-destructive">{error}</p>}
          <button type="submit" disabled={busy || (step === "code" && !/^\d{6}$/.test(code))} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
            {busy ? "Working…" : step === "email" ? "Send code" : "Open my photos"}
          </button>
          {step === "code" && (
            <button type="button" disabled={busy || cooldown > 0} onClick={() => void send()} className="text-xs text-ink-subtle underline underline-offset-2 disabled:no-underline disabled:opacity-60">
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't get it? Resend"}
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
