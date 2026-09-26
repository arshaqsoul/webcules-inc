"use client";

/* Dormancy banner (WEB-159) — shown when the studio's objects sit in cold
 * storage after a dormant period, or while a bulk restore is in flight. */
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";

export function DormancyBanner({ kind, objects }: { kind: "cold" | "restoring"; objects?: number }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(kind === "restoring" ? "done" : "idle");

  async function restore() {
    setState("busy");
    try {
      const res = await fetch("/api/studio/storage-restore", { method: "POST" });
      if (!res.ok) throw new Error();
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (kind === "restoring" && state === "done") {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink">
        Your files are moving back to standard storage ({objects ?? 0} objects remaining — it finishes within a day).
        Everything works normally in the meantime.
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink">
        Restore queued — your files move back to standard storage over the next day. Everything works normally in the
        meantime.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink">
      <span>
        Welcome back! Your studio was dormant, so your files were moved to low-cost cold storage. They all work
        normally — you can move them back to standard storage any time.
      </span>
      <Button size="sm" disabled={state === "busy"} onClick={() => void restore()}>
        {state === "busy" ? "Queuing…" : state === "error" ? "Retry" : "Restore to standard storage"}
      </Button>
    </div>
  );
}
