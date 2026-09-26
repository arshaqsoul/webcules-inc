"use client";

/* Portal login form (WEB-131) — email → 6-digit magic code. Copy mirrors the
 * enumeration-safe API: the same "check your email" message whether or not a
 * portal exists for the address. */
import { useEffect, useRef, useState } from "react";

export function PortalLogin({ turnstileSiteKey }: { turnstileSiteKey: string }) {
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
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [turnstileSiteKey]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestCode() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/portal/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: tsToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!body.ok && body.error === "captcha") {
        setError("Please complete the verification.");
        return;
      }
      // Enumeration-safe: same message whatever the API decided internally.
      setStep("code");
      setCooldown(30);
    } catch {
      setError("Couldn't reach Snap — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/portal/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, turnstileToken: tsToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (body.ok) {
        window.location.href = "/portal";
        return;
      }
      if (body.error === "captcha") setError("Please complete the verification.");
      else setError("That code didn't match — check the email and try again.");
    } catch {
      setError("Couldn't reach Snap — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-8">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6ad2]">Snap</span>
      <h1 className="mt-3 text-xl font-semibold text-ink">
        {step === "email" ? "Sign in to your client portal" : "Enter your code"}
      </h1>
      <p className="mt-2 text-sm text-ink-subtle">
        {step === "email"
          ? "One login for every studio you work with — we'll email you a sign-in code."
          : `We sent a 6-digit code to ${email}. It expires in 10 minutes.`}
      </p>

      {step === "email" ? (
        <div className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email && void requestCode()}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-lg border border-hairline bg-canvas px-3.5 py-2.5 text-sm text-ink outline-none focus:border-[#5e6ad2]"
          />
          <div ref={tsRef} />
          <button
            type="button"
            disabled={busy || !email || (Boolean(turnstileSiteKey) && !tsToken)}
            onClick={() => void requestCode()}
            className="rounded-lg bg-[#5e6ad2] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Checking…" : "Email me a code"}
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          <input
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && code.length === 6 && void verify()}
            placeholder="••••••"
            className="w-full rounded-lg border border-hairline bg-canvas px-3.5 py-2.5 text-center text-2xl tracking-[0.4em] text-ink outline-none focus:border-[#5e6ad2]"
          />
          <div ref={tsRef} />
          <button
            type="button"
            disabled={busy || code.length !== 6}
            onClick={() => void verify()}
            className="rounded-lg bg-[#5e6ad2] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Open my portal"}
          </button>
          <button
            type="button"
            disabled={cooldown > 0}
            onClick={() => void requestCode()}
            className="text-xs text-ink-subtle underline underline-offset-2 disabled:opacity-50"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          <button type="button" onClick={() => setStep("email")} className="text-xs text-ink-subtle underline underline-offset-2">
            Use a different email
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
