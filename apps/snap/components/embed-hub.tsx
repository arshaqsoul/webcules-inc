"use client";

/* Embed hub (WEB-168) — one place to see, configure and copy every
 * integration: contact form, booking calendar, booking button (modal) and
 * the public booking link. Snippets carry the embed key, widget attributes
 * and the chosen theme/token overrides; previews render with the exact same
 * query tokens the loader would build. */
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { useConfirm } from "@/components/confirm-provider";

type Props = {
  embedKey: string;
  slug: string;
  /** Studio-level widget theme from the brand profile (fallback when no override). */
  studioTheme: string;
  studioFontFamily: string;
  originsCount: number;
  /** Brand updatedAt — bumping it (a save) reloads the preview iframes,
   * which React otherwise keeps mounted since their src never changes. */
  revision?: string;
  /** Unsaved token edits from the JSON box — forwarded so the previews
   * track what you're typing; the widget route re-sanitizes server-side. */
  liveTokens?: Record<string, unknown>;
  /** Lets the parent (settings form) refresh its logo URL after a rotation. */
  onKeyRotated?: (newKey: string) => void;
};

const APP_ORIGIN = "https://snap.webcules.com";
const LOADER = `${APP_ORIGIN}/embed/loader.js`;

const inputCls =
  "rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink";

type WidgetKind = "contact" | "calendar" | "calendar-button";

export function EmbedHub({ embedKey, slug, studioTheme, studioFontFamily, originsCount, revision, liveTokens, onKeyRotated }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [theme, setTheme] = useState("brand"); // brand | light | dark | auto
  const [inherit, setInherit] = useState(false);
  const [radius, setRadius] = useState("");
  const [accent, setAccent] = useState("");
  const [label, setLabel] = useState("Book a session");
  const [copied, setCopied] = useState<string | null>(null);
  const [key, setKey] = useState(embedKey);
  const [busy, setBusy] = useState(false);

  const attrs: string[] = [];
  if (theme !== "brand") attrs.push(`data-snap-theme="${theme}"`);
  if (inherit) attrs.push('data-snap-inherit="auto"');
  const r = radius.trim();
  if (/^(\d{1,3}px|\d{1,2}(\.\d+)?rem|50%)$/.test(r)) attrs.push(`data-snap-radius="${r}"`);
  const a = accent.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(a)) attrs.push(`data-snap-accent="${a}"`);
  const attrStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";

  function snippet(kind: WidgetKind): string {
    const labelAttr = kind === "calendar-button" ? ` data-snap-label="${label.replace(/"/g, "&quot;")}"` : "";
    return [
      `<!-- Snap · ${kind === "contact" ? "contact form" : kind === "calendar" ? "booking calendar" : "booking button"} -->`,
      `<div data-snap-widget="${kind}" data-snap-key="${key}"${labelAttr}${attrStr}></div>`,
      `<script src="${LOADER}" async></script>`,
    ].join("\n");
  }

  /**
   * Mirrors the loader's buildSrc so the preview matches production rendering.
   * `rev` busts the iframe when a save lands; live token edits ride along as
   * query overrides (the widget re-sanitizes and layers them over the brand).
   */
  function previewSrc(kind: "contact" | "calendar"): string {
    const q = new URLSearchParams({ key });
    const resolved = theme === "brand" ? studioTheme : theme;
    q.set("theme", resolved === "dark" ? "dark" : "light"); // previews are static: auto → light
    if (studioFontFamily) q.set("fontFamily", studioFontFamily);
    if (/^#[0-9a-f]{6}$/.test(a)) q.set("accent", a);
    if (/^(\d{1,3}px|\d{1,2}(\.\d+)?rem|50%)$/.test(r)) q.set("radius", r);
    if (liveTokens) {
      for (const [k, v] of Object.entries(liveTokens)) {
        if (typeof v === "string" && v) q.set(k, v);
      }
    }
    if (revision) q.set("rev", revision);
    return `/embed/${kind}?${q.toString()}`;
  }

  async function copy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  async function rotateKey() {
    if (
      !(await confirm({
        title: "Rotate embed key?",
        body: "Widgets using the old key stop working immediately — every snippet below updates to the new key.",
        destructive: true,
        requireText: "ROTATE",
      }))
    )
      return;
    setBusy(true);
    const res = await fetch("/api/studio/embed", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setBusy(false);
    if (res.ok) {
      const next = String(body.embedKey ?? key);
      setKey(next);
      onKeyRotated?.(next);
    }
  }

  const bookingUrl = `${APP_ORIGIN}/b/${slug}`;

  const snippetBlock = (id: string, kind: WidgetKind) => (
    <div className="flex items-start gap-2">
      <code className="flex-1 overflow-x-auto whitespace-pre rounded-md bg-canvas px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-muted">
        {snippet(kind)}
      </code>
      <Button
        variant="secondary"
        size="icon"
        aria-label={`Copy ${id} snippet`}
        onClick={() => void copy(id, snippet(kind))}
      >
        {copied === id ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      </Button>
    </div>
  );

  const subcard = "rounded-lg border border-hairline bg-background p-4 flex flex-col gap-3";

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium text-ink">Embeds</h2>
          <p className="mt-1 text-xs text-ink-subtle">
            Copy a snippet into any website —{" "}
            <a href="/docs/embeds#html" className="text-primary hover:underline">
              plain HTML
            </a>
            ,{" "}
            <a href="/docs/embeds#wordpress" className="text-primary hover:underline">
              WordPress
            </a>{" "}
            (Custom HTML block),{" "}
            <a href="/docs/embeds#builders" className="text-primary hover:underline">
              Squarespace / Wix / Framer
            </a>{" "}
            (embed block), or{" "}
            <a href="/docs/embeds#nextjs" className="text-primary hover:underline">
              Next.js
            </a>
            /{" "}
            <a href="/docs/embeds#astro" className="text-primary hover:underline">
              Astro
            </a>{" "}
            — full guides with the{" "}
            <a href="/docs/embeds#react" className="text-primary hover:underline">
              React package
            </a>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <code className="rounded bg-canvas px-2 py-1 font-mono text-[11px] text-ink-tertiary">{key}</code>
          <Button variant="ghost" size="sm" onClick={rotateKey} disabled={busy} className="text-ink-subtle">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Rotate key
          </Button>
        </div>
      </div>

      {originsCount === 0 && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-[13px] text-amber-600 dark:text-amber-400">
          Your widgets currently embed from any website. Add your site under “Allowed embed sites” below to lock them
          to it.
        </p>
      )}

      <div className="mt-4 grid gap-3 rounded-lg border border-hairline bg-background p-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-ink-subtle">
          Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value)} className={inputCls}>
            <option value="brand">Studio default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Follow host site</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-subtle">
          Accent override
          <input value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#5e6ad2" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-subtle">
          Corner radius
          <input value={radius} onChange={(e) => setRadius(e.target.value)} placeholder="12px" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-subtle">
          Button label
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-subtle sm:col-span-4">
          <input type="checkbox" checked={inherit} onChange={(e) => setInherit(e.target.checked)} className="h-4 w-4" />
          Auto-inherit host styling (widget samples the surrounding font, text and background colors)
        </label>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className={subcard}>
          <div>
            <h3 className="text-sm font-medium text-ink">Contact form</h3>
            <p className="mt-0.5 text-xs text-ink-subtle">Inline inquiry form — leads land in your inbox.</p>
          </div>
          <div className="overflow-hidden rounded-lg border border-hairline">
            <iframe title="Contact form preview" src={previewSrc("contact")} className="h-80 w-full border-0" />
          </div>
          {snippetBlock("contact", "contact")}
        </div>

        <div className={subcard}>
          <div>
            <h3 className="text-sm font-medium text-ink">Booking calendar</h3>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Inline availability calendar — bookings, holds and payment in one flow.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-hairline">
            <iframe title="Booking calendar preview" src={previewSrc("calendar")} className="h-80 w-full border-0" />
          </div>
          {snippetBlock("calendar", "calendar")}
        </div>

        <div className={subcard}>
          <div>
            <h3 className="text-sm font-medium text-ink">Booking button</h3>
            <p className="mt-0.5 text-xs text-ink-subtle">
              A “{label || "Book a session"}” button that opens the calendar in a modal — for crowded pages.
            </p>
          </div>
          <div className="flex items-center justify-center rounded-lg border border-dashed border-hairline px-4 py-8">
            <span className="rounded-lg px-4 py-2.5 text-sm font-medium text-white" style={{ background: /^#[0-9a-fA-F]{6}$/.test(a) ? a : "#5e6ad2" }}>
              {label || "Book a session"}
            </span>
          </div>
          {snippetBlock("button", "calendar-button")}
        </div>

        <div className={subcard}>
          <div>
            <h3 className="text-sm font-medium text-ink">Public booking link</h3>
            <p className="mt-0.5 text-xs text-ink-subtle">
              A standalone booking page for bio links, Instagram and email signatures — no website needed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/b/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 truncate rounded-md bg-canvas px-3 py-2 font-mono text-xs text-primary underline-offset-2 hover:underline"
            >
              {bookingUrl}
            </a>
            <Button variant="secondary" size="icon" aria-label="Copy booking link" onClick={() => void copy("link", bookingUrl)}>
              {copied === "link" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </Button>
            <a
              href={`/b/${slug}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Open booking page"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-muted hover:bg-surface-2"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </div>
          <p className="text-[11px] text-ink-tertiary">
            Theming for the booking page follows your studio brand (set above) — no snippet needed.
          </p>
        </div>
      </div>
    </section>
  );
}
