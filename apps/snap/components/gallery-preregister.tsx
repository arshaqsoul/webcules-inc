"use client";

/* WEB-266: the pre-registration page for a scheduled gallery — "Be the
 * first to see it." Guests who register get the link automatically the
 * moment the photographer opens (one click, auto-notified). */

import { useState } from "react";

export function GalleryPreRegister({ token, studioName, accent, openAt }: {
  token: string;
  studioName: string;
  accent: string;
  openAt: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const when = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date(openAt));

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6" style={{ ["--accent" as string]: accent }}>
      <div className="w-full max-w-md rounded-[16px] border border-hairline bg-surface-1 p-8 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: accent }}>
          {studioName}
        </span>
        <h1 className="mt-3 text-xl font-semibold text-ink">Something beautiful is coming</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-subtle">
          Your gallery opens {when}. Leave your email and you&apos;ll be the first to see it — we&apos;ll send the link the moment it&apos;s live.
        </p>

        {done ? (
          <p className="mt-6 rounded-lg bg-surface-2 px-4 py-3 text-sm font-medium text-ink">You&apos;re on the list ✓ — watch your inbox{email ? ` at ${email}` : ""}.</p>
        ) : (
          <form
            className="mt-6 flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const res = await fetch(`/api/g/${token}/guest`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email, kind: "preregistered" }),
                });
                const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                if (res.ok && body.ok) setDone(true);
                else {
                  setError(body.error === "invalid_email" ? "That email doesn't look right — try again." : "Couldn't save — try again.");
                }
              } catch {
                setError("Network error — try again.");
              }
              setBusy(false);
            }}
          >
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-hairline-strong bg-canvas px-3.5 py-2.5 text-sm text-ink outline-none focus:border-[var(--accent)]"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60" style={{ background: accent }}>
              {busy ? "Saving…" : "Be the first to see it"}
            </button>
          </form>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-ink-tertiary">{studioName} will see your email. No marketing — just your gallery.</p>
      </div>
    </main>
  );
}
