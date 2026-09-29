"use client";

/* WEB-265: the Nudge button (manual "still deciding?" email). */

import { useState } from "react";

import { Button } from "@webcules/ui/components/button";

export function NudgeButton({ grantId, clientEmail }: { grantId: string; clientEmail: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        title={`Send ${clientEmail} a friendly reminder with their gallery link`}
        onClick={async () => {
          setBusy(true);
          setNote("");
          try {
            const res = await fetch(`/api/grants/${grantId}/nudge`, { method: "POST" });
            const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
            setNote(res.ok && body.ok ? "sent ✓" : body.error === "link_dead" ? "link dead — send a new one first" : "couldn't send");
            setTimeout(() => setNote(""), 4000);
          } catch {
            setNote("network error");
          }
          setBusy(false);
        }}
      >
        {busy ? "Sending…" : "Nudge"}
      </Button>
      {note ? <span className="text-[11px] text-ink-tertiary">{note}</span> : null}
    </span>
  );
}
