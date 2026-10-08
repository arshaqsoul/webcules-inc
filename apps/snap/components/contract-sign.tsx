"use client";

/* Public contract signing form (WEB-158) — typed name + Turnstile. */
import { useState } from "react";
import { useTurnstile } from "@/components/use-turnstile";

export function ContractSignForm({ token, accent, turnstileSiteKey }: { token: string; accent: string; turnstileSiteKey: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { ref: tsRef, token: tsToken } = useTurnstile(turnstileSiteKey);

  async function sign() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/c/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, turnstileToken: tsToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (body.ok) {
        window.location.reload();
        return;
      }
      setError(
        body.error === "captcha"
          ? "Please complete the verification."
          : body.error === "already_signed"
            ? "This contract is already signed."
            : "Enter your full legal name to sign.",
      );
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-subtle">Ready to sign? Type your full legal name below.</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your full legal name"
        autoComplete="name"
        className="w-full rounded-lg border border-hairline bg-canvas px-3.5 py-2.5 text-sm text-ink outline-none"
        style={{ borderTop: "none", borderLeft: "none", borderRight: "none", borderBottom: `2px solid ${accent}`, borderRadius: 0, background: "transparent", paddingLeft: 0 }}
      />
      <div ref={tsRef} />
      <button
        type="button"
        disabled={busy || name.trim().length < 3 || (Boolean(turnstileSiteKey) && !tsToken)}
        onClick={() => void sign()}
        className="self-start rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        style={{ background: accent }}
      >
        {busy ? "Signing…" : "Sign contract"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
