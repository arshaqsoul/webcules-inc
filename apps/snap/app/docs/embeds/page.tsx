/* Integration docs (WEB-169) — how to embed Snap widgets in every common
 * stack. Public (no auth). The live demo renders the real @webcules/snap-react
 * components, so this page doubles as the package's smoke test.
 *
 * TODO: swap the demo key to a dedicated demo studio when one exists; for now
 * the first organization's embed key powers it (embed keys are public by
 * design — they're pasted into public websites). */
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { DocsCode } from "@/components/docs-code";
import { DocsLiveDemo } from "@/components/docs-live-demo";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Embed Snap — integration guides",
  description:
    "Add the Snap contact form, booking calendar or booking button to any website: plain HTML, Next.js, Astro, React, WordPress and page builders.",
};

const LOADER = "https://snap.webcules.com/embed/loader.js";

async function demoKey(): Promise<string> {
  const row = (
    await getDb()
      .select({ embedKey: schema.studioProfiles.embedKey })
      .from(schema.studioProfiles)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.studioProfiles.organizationId))
      .where(eq(schema.organization.slug, "willow-and-pine-photo"))
      .limit(1)
  )[0];
  return row?.embedKey ?? "";
}

const GUIDES = [
  { id: "html", label: "Plain HTML" },
  { id: "nextjs", label: "Next.js" },
  { id: "astro", label: "Astro" },
  { id: "react", label: "React SPA" },
  { id: "wordpress", label: "WordPress" },
  { id: "builders", label: "Squarespace / Wix / Framer" },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[17px] font-semibold tracking-[-.3px] text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export default async function EmbedDocsPage() {
  const key = await demoKey();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-[-.8px] text-ink">Embed Snap anywhere</h1>
        <p className="text-sm leading-relaxed text-ink-subtle">
          The contact form, booking calendar and booking button are one script tag each — they work on any website.
          Grab your snippets ready-made from{" "}
          <Link href="/dashboard/settings" className="text-primary hover:underline">
            Settings → Embeds
          </Link>{" "}
          in your dashboard, or paste the examples below. Want the pages themselves on{" "}
          <Link href="/docs/domains" className="text-primary hover:underline">
            your own domain
          </Link>
          ?
        </p>
        <div className="rounded-md bg-amber-500/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-600 dark:text-amber-400">
          <strong>Before you embed:</strong> widgets render inside an iframe guarded by <code>frame-ancestors</code>.
          Add your site under Settings → Embeds → Allowed embed sites, or the browser will block the iframe. If your
          site ships its own CSP, allow <code>script-src {LOADER.replace("/embed/loader.js", "")}</code> and{" "}
          <code>frame-src {LOADER.replace("/embed/loader.js", "")}</code>.
        </div>
        <nav aria-label="Guides" className="flex flex-wrap gap-1.5">
          {GUIDES.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="rounded-full border border-hairline bg-surface-1 px-3.5 py-1.5 text-[13px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              {g.label}
            </a>
          ))}
        </nav>
      </header>

      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[17px] font-semibold tracking-[-.3px] text-ink">Live demo (React package)</h2>
        <p className="mt-1 mb-4 text-sm text-ink-subtle">
          The tabs below mount the actual <code>@webcules/snap-react</code> components — the same code the React guide
          gives you.
        </p>
        {key ? <DocsLiveDemo apiKey={key} /> : <p className="text-sm text-ink-subtle">Demo unavailable.</p>}
      </section>

      <Section id="html" title="Plain HTML">
        <p className="text-sm text-ink-subtle">
          Paste where the widget should appear. No build step, no framework — this is the base form every other guide
          reduces to.
        </p>
        <DocsCode
          label="Contact form"
          code={`<!-- Snap · contact form -->
<div data-snap-widget="contact"
     data-snap-key="YOUR_EMBED_KEY"
     data-snap-theme="auto"></div>
<script src="${LOADER}" async></script>`}
        />
        <DocsCode
          label="Booking calendar with token overrides"
          code={`<!-- Snap · booking calendar, themed -->
<div data-snap-widget="calendar"
     data-snap-key="YOUR_EMBED_KEY"
     data-snap-theme="dark"
     data-snap-accent="#1e8e3e"
     data-snap-radius="16px"></div>
<script src="${LOADER}" async></script>`}
        />
        <DocsCode
          label="Booking button (opens a modal)"
          code={`<!-- Snap · booking button -->
<div data-snap-widget="calendar-button"
     data-snap-key="YOUR_EMBED_KEY"
     data-snap-label="Book a session"></div>
<script src="${LOADER}" async></script>`}
        />
        <p className="text-xs text-ink-tertiary">
          Tokens: <code>data-snap-theme</code> (light / dark / auto), <code>data-snap-accent</code>,{" "}
          <code>data-snap-radius</code>, <code>data-snap-font-family</code>, <code>data-snap-inherit=&quot;auto&quot;</code>{" "}
          (samples the surrounding page so the widget blends in). Omitting tokens falls back to your studio brand.
        </p>
      </Section>

      <Section id="nextjs" title="Next.js (App Router)">
        <p className="text-sm text-ink-subtle">Two ways — the React package, or the zero-dependency script variant.</p>
        <DocsCode
          label="1a. React package (npm)"
          code={`npm install @webcules/snap-react`}
        />
        <DocsCode
          code={`// app/booking/page.tsx → components use hooks, so mark the file "use client"
"use client";
import { SnapCalendar } from "@webcules/snap-react";

export default function BookingPage() {
  return <SnapCalendar apiKey={process.env.NEXT_PUBLIC_SNAP_KEY!} theme="auto" />;
}`}
        />
        <DocsCode
          label="1b. next/script variant (no npm dependency)"
          code={`// app/booking/page.tsx — a Server Component is fine here
import Script from "next/script";

export default function BookingPage() {
  return (
    <>
      <div
        data-snap-widget="calendar"
        data-snap-key={process.env.NEXT_PUBLIC_SNAP_KEY!}
        data-snap-theme="auto"
      />
      <Script src="${LOADER}" strategy="afterInteractive" />
    </>
  );
}`}
        />
        <p className="text-xs text-ink-tertiary">
          StrictMode-safe: the package mounts through <code>window.Snap.mount</code> and destroys on cleanup, so the
          double-invoked effect in development remounts cleanly.
        </p>
      </Section>

      <Section id="astro" title="Astro">
        <p className="text-sm text-ink-subtle">
          Works with zero wrapper — but mark the loader <code>is:inline</code>, or Astro will try to bundle the remote
          script instead of emitting the tag.
        </p>
        <DocsCode
          code={`---
// src/pages/contact.astro (.env: PUBLIC_SNAP_KEY=…)
const key = import.meta.env.PUBLIC_SNAP_KEY;
---
<div data-snap-widget="contact" data-snap-key={key} data-snap-theme="auto"></div>
<script is:inline src="${LOADER}" async></script>`}
        />
      </Section>

      <Section id="react" title="React SPA (Vite, CRA, etc.)">
        <DocsCode label="Install" code={`npm install @webcules/snap-react`} />
        <DocsCode
          code={`import { SnapContactForm, SnapCalendarButton } from "@webcules/snap-react";

function App() {
  return (
    <>
      <SnapContactForm apiKey={import.meta.env.VITE_SNAP_KEY} inherit />
      <SnapCalendarButton apiKey={import.meta.env.VITE_SNAP_KEY} label="Book a session" />
    </>
  );
}`}
        />
        <p className="text-xs text-ink-tertiary">
          SPAs with client-side routing: the components mount/unmount with the route, and the loader script is injected
          once per document automatically.
        </p>
      </Section>

      <Section id="wordpress" title="WordPress">
        <p className="text-sm text-ink-subtle">
          Add a <strong>Custom HTML</strong> block (Gutenberg) or a HTML widget (Classic) where the widget should
          appear, and paste the snippet.
        </p>
        <DocsCode
          code={`<!-- Custom HTML block -->
<div data-snap-widget="calendar"
     data-snap-key="YOUR_EMBED_KEY"
     data-snap-theme="auto"></div>
<script src="${LOADER}" async></script>`}
        />
        <p className="text-xs text-ink-tertiary">
          For site-wide placement, paste the same snippet into your theme template (e.g.{" "}
          <code>page-template.php</code>) or a header/footer-scripts plugin. If your theme strips script tags, use a
          &quot;custom code&quot; plugin that supports them.
        </p>
      </Section>

      <Section id="builders" title="Squarespace / Wix / Framer">
        <p className="text-sm text-ink-subtle">
          Use each builder&apos;s embed block — Squarespace <strong>Code Block</strong>, Wix <strong>HTML iframe / Custom
          Element</strong>, Framer <strong>Embed</strong> — and paste the snippet.
        </p>
        <DocsCode
          code={`<div data-snap-widget="calendar-button"
     data-snap-key="YOUR_EMBED_KEY"
     data-snap-label="Book a session"></div>
<script src="${LOADER}" async></script>`}
        />
        <p className="text-xs text-ink-tertiary">
          Some builders sandbox embed blocks into blank iframes — if the widget doesn&apos;t appear, use the
          builder&apos;s site-level code injection (Squarespace: Settings → Advanced → Code Injection; Wix: Settings →
          Custom Code) with the placeholder <code>div</code> in the page body and the script tag in the footer.
        </p>
      </Section>

      <footer className="pb-6 text-center text-xs text-ink-tertiary">
        Snippets are generated per studio with your key and theme at Settings → Embeds. Questions — hello@webcules.com.
      </footer>
    </div>
  );
}
