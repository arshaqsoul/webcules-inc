"use client";

/* Calendar → Booking page (WEBC-112) — the public booking link surfaced where
 * photographers actually look for it. Copy works on every tier; Customize
 * leads to the designer on Settings → Website & booking (Free sees the Lite
 * upsell there, via the existing locked pattern). */
import Link from "next/link";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";

export function CalendarBookingPage({ bookingUrl, canEdit }: { bookingUrl: string; canEdit: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    // Same beacon EmbedHub's booking-link copy fires — the setup guide's
    // "put Snap on your website" step tracks link shares too. Fire-and-forget.
    void fetch("/api/studio/setup/embed-copied", { method: "POST" }).catch(() => {});
  }

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Booking page</h2>
      <p className="mt-1 text-xs text-ink-subtle">
        Your public booking link — share it in your Instagram bio, email signature or anywhere
        clients already find you. No website needed.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-canvas px-3 py-2 font-mono text-xs text-ink">
          {bookingUrl}
        </code>
        <Button variant="secondary" size="sm" aria-label="Copy booking link" onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a
          href={bookingUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ExternalLink className="h-4 w-4" aria-hidden /> Open page
        </a>
        <Link
          href="/dashboard/settings/embeds#booking-page"
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Customize
        </Link>
      </div>
      {!canEdit && (
        <p className="mt-3 text-xs text-ink-subtle">
          Customizing the words on your booking page is included with Lite and above —{" "}
          <a href="/dashboard/settings/billing" className="font-medium text-primary hover:underline">
            upgrade to Lite →
          </a>
        </p>
      )}
    </section>
  );
}
