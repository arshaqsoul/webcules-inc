"use client";

/* Live demo for the integration docs (WEB-169) — mounts the actual
 * @webcules/snap-react components, so the docs double as the package's
 * smoke test in a real React 19 app. */
import { useState } from "react";

import { SnapCalendar, SnapCalendarButton, SnapContactForm } from "@webcules/snap-react";

type DemoProps = { apiKey: string };

export function DocsLiveDemo({ apiKey }: DemoProps) {
  const [kind, setKind] = useState<"contact" | "calendar" | "button">("contact");
  const tab = (k: typeof kind, label: string) => (
    <button
      key={k}
      type="button"
      onClick={() => setKind(k)}
      className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
        kind === k ? "bg-surface-2 text-ink" : "text-ink-subtle hover:bg-surface-1 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {tab("contact", "SnapContactForm")}
        {tab("calendar", "SnapCalendar")}
        {tab("button", "SnapCalendarButton")}
      </div>
      <div className="rounded-lg border border-hairline bg-background p-4">
        {kind === "contact" && <SnapContactForm apiKey={apiKey} />}
        {kind === "calendar" && <SnapCalendar apiKey={apiKey} />}
        {kind === "button" && (
          <div className="flex justify-center py-8">
            <SnapCalendarButton apiKey={apiKey} label="Book a session (React)" />
          </div>
        )}
      </div>
      <p className="text-xs text-ink-tertiary">
        Rendered by the published components — unmount/remount the tabs to see the StrictMode-safe lifecycle.
      </p>
    </div>
  );
}
