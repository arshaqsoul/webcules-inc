"use client";

/* Completes a save parked while signed out (parkPendingSave in
 * lib/saved-configs). Mounted from the login panel AND the dashboard so the
 * replay runs wherever the sign-in callback lands — magic-link and OAuth
 * callbacks arrive as plain page loads on the redirect target, not on the
 * login form's success path. */
import { useEffect } from "react";

import { saveConfig, takePendingSave } from "@/lib/saved-configs";

/** On mount, once enabled: finish the parked save fire-and-forget. */
export function useReplayPendingSave(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const pending = takePendingSave();
    if (!pending) return;
    saveConfig(pending)
      .then((res) => {
        if (!res.ok) {
          console.warn("[saved-configs] pending save replay unauthorized");
        }
      })
      .catch((e: unknown) => {
        console.warn("[saved-configs] pending save replay failed:", e);
      });
  }, [enabled]);
}
