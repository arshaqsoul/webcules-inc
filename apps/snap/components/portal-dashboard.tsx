"use client";

/* Small client-side bits for the portal (WEB-130/133/136). */
import { useState } from "react";

export function PortalSignOut() {
  return (
    <button
      type="button"
      onClick={() => {
        void fetch("/portal/api/logout", { method: "POST" }).then(() => {
          window.location.href = "/portal/login";
        });
      }}
      className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-subtle hover:text-ink"
    >
      Sign out
    </button>
  );
}

/** Per-studio email opt-out (WEB-136) — flips the client row's notify flag. */
export function NotifyToggle({ organizationId, initial }: { organizationId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function flip() {
    if (busy) return;
    setBusy(true);
    const next = !on;
    try {
      const res = await fetch("/portal/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, notify: next }),
      });
      if (!res.ok) throw new Error();
      setOn(next);
    } catch {
      // state unchanged — the toggle stays truthful
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void flip()}
      disabled={busy}
      className="flex items-center gap-2 text-xs text-ink-subtle hover:text-ink"
      title="Gallery links, booking confirmations and delivery notices from this studio"
    >
      <span
        className={`relative inline-block h-4 w-7 rounded-full transition-colors ${on ? "bg-[#5e6ad2]" : "bg-hairline"}`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`}
        />
      </span>
      Email updates from this studio {on ? "on" : "off"}
    </button>
  );
}
