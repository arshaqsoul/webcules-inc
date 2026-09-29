"use client";

/* Settings → Embeds (WEB-234/235, formalized in 236): wraps EmbedHub with
 * the allowed-origins textarea that used to be the third card of the
 * settings monolith. Same API routes, same payloads — pure re-composition. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";

import { EmbedHub } from "@/components/embed-hub";

export function SettingsEmbeds({
  embedKey,
  slug,
  bookingUrl,
  studioTheme,
  studioAccent,
  studioFontFamily,
  embedOrigins,
  brandRevision,
}: {
  embedKey: string;
  slug: string;
  bookingUrl: string;
  studioTheme: string;
  studioAccent: string;
  studioFontFamily: string;
  embedOrigins: string[];
  brandRevision: string;
}) {
  const router = useRouter();
  const [origins, setOrigins] = useState(embedOrigins.join("\n"));
  const [key, setKey] = useState(embedKey);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function saveOrigins() {
    setBusy(true);
    setStatus(null);
    const list = origins.split("\n").map((l) => l.trim()).filter(Boolean);
    const res = await fetch("/api/studio/embed", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origins: list }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setStatus(
      res.ok
        ? `Origins saved (${((body.origins as string[] | undefined)?.length ?? 0)}). ${list.length === 0 ? "Embeds are open from any site until you add origins." : "Embeds now restricted to these sites."}`
        : `Save failed: ${String(body.error ?? "unknown")}`,
    );
    if (res.ok) router.refresh();
  }

  const card = "rounded-[12px] border border-hairline bg-surface-1 p-5";

  return (
    <div className="flex flex-col gap-4">
      <EmbedHub
        embedKey={key}
        slug={slug}
        bookingUrl={bookingUrl}
        studioTheme={studioTheme}
        studioAccent={studioAccent}
        studioFontFamily={studioFontFamily}
        originsCount={embedOrigins.length}
        revision={brandRevision}
        onKeyRotated={(newKey) => setKey(newKey)}
      />

      <section className={card} id="origins">
        <h2 className="text-[15px] font-medium text-ink">Allowed embed sites</h2>
        <p className="mt-1 text-xs text-ink-subtle">
          One origin per line (e.g. https://yourstudio.com). Empty = widgets embed from any site —
          add your website to lock them to it.
        </p>
        <textarea
          className="mt-3 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-ink"
          value={origins}
          placeholder={"https://yourstudio.com\nhttps://www.yourstudio.com"}
          onChange={(e) => setOrigins(e.target.value)}
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={saveOrigins} disabled={busy} size="sm">Save origins</Button>
        </div>
      </section>

      {status && <p className="text-sm text-ink-subtle">{status}</p>}
    </div>
  );
}
