"use client";

/* Private project notes editor (WEB-115) — shot list, locations, special
 * requests. Studio-only; never rendered in any client-facing surface. */
import { useRef, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Textarea } from "@webcules/ui/components/textarea";

export function ProjectNotes({ projectId, initialNotes }: { projectId: string; initialNotes: string }) {
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const savedAt = useRef(0);
  const [showSaved, setShowSaved] = useState(false);

  const dirty = notes !== initialNotes;

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        setError("Couldn't save — try again.");
      } else {
        savedAt.current = Date.now();
        setShowSaved(true);
        setTimeout(() => {
          if (Date.now() - savedAt.current >= 2400) setShowSaved(false);
        }, 2500);
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value.slice(0, 8000))}
        rows={5}
        placeholder="Shot list, location details, special requests — anything the studio should keep in mind. Private to your team."
        aria-label="Project notes"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? "Saving…" : "Save notes"}
        </Button>
        {showSaved && <span className="text-xs text-success-text">Saved</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
        <span className="ml-auto text-xs text-ink-tertiary">{dirty ? "Unsaved changes" : ""}</span>
      </div>
    </div>
  );
}
