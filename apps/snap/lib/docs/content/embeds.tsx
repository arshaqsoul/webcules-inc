/* Embeds — restructured from app/docs/embeds/page.tsx (WEB-169; approved
 * copy preserved): how to embed Snap widgets in every common stack. The
 * content module stays a sync component; LiveDemo below is an async server
 * component child that fetches the demo studio's public embed key (embed
 * keys are public by design — they're pasted into public websites). */
import { eq } from "drizzle-orm";

import { H2, Note, Callout, Related } from "@/lib/docs/primitives";

import { DocsCode } from "@/components/docs-code";
import { DocsLiveDemo } from "@/components/docs-live-demo";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

const LOADER = "https://snap.webcules.com/embed/loader.js";

async function LiveDemo() {
  const row = (
    await getDb()
      .select({ embedKey: schema.studioProfiles.embedKey })
      .from(schema.studioProfiles)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.studioProfiles.organizationId))
      .where(eq(schema.organization.slug, "willow-and-pine-photo"))
      .limit(1)
  )[0];
  const key = row?.embedKey ?? "";
  if (!key) return <p>Demo unavailable.</p>;
  return <DocsLiveDemo apiKey={key} />;
}

export default function Embeds() {
  return (
    <>
      <p>
        The contact form, booking calendar and booking button are one script tag each — they work
        on any website. Grab your snippets ready-made from{" "}
        <a href="/dashboard/settings/embeds">Settings → Embeds</a>, or paste the examples below.
        Want the pages themselves on your own domain? See{" "}
        <a href="/docs/domains">custom domains</a>.
      </p>

      <Callout tone="warn" title="Before you embed">
        Widgets render inside an iframe guarded by <code>frame-ancestors</code>. Add your site
        under Settings → Embeds → Allowed embed sites, or the browser will block the iframe. If
        your site ships its own CSP, allow <code>script-src https://snap.webcules.com</code> and{" "}
        <code>frame-src https://snap.webcules.com</code>.
      </Callout>

      <H2>Live demo (React package)</H2>
      <p>
        The tabs below mount the actual <code>@webcules/snap-react</code> components — the same
        code the React guide gives you.
      </p>
      <LiveDemo />

      <H2>Plain HTML</H2>
      <p>
        Paste where the widget should appear. No build step, no framework — this is the base form
        every other guide reduces to.
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
      <Note>
        Tokens: <code>data-snap-theme</code> (light / dark / auto), <code>data-snap-accent</code>,{" "}
        <code>data-snap-radius</code>, <code>data-snap-font-family</code>, and{" "}
        <code>data-snap-inherit="auto"</code>, which samples the surrounding page so the widget
        blends in. Omitting tokens falls back to your studio brand.
      </Note>

      <H2>Next.js (App Router)</H2>
      <p>Two ways — the React package, or the zero-dependency script variant.</p>
      <DocsCode label="1a. React package (npm)" code={`npm install @webcules/snap-react`} />
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
      <Note>
        StrictMode-safe: the package mounts through <code>window.Snap.mount</code> and destroys on
        cleanup, so the double-invoked effect in development remounts cleanly.
      </Note>

      <H2>Astro</H2>
      <p>
        Works with zero wrapper — but mark the loader <code>is:inline</code>, or Astro will try to
        bundle the remote script instead of emitting the tag.
      </p>
      <DocsCode
        code={`---
// src/pages/contact.astro (.env: PUBLIC_SNAP_KEY=…)
const key = import.meta.env.PUBLIC_SNAP_KEY;
---
<div data-snap-widget="contact" data-snap-key={key} data-snap-theme="auto"></div>
<script is:inline src="${LOADER}" async></script>`}
      />

      <H2>React SPA (Vite, CRA, etc.)</H2>
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
      <Note>
        SPAs with client-side routing: the components mount and unmount with the route, and the
        loader script is injected once per document automatically.
      </Note>

      <H2>WordPress</H2>
      <p>
        Add a <strong>Custom HTML</strong> block (Gutenberg) or a HTML widget (Classic) where the
        widget should appear, and paste the snippet.
      </p>
      <DocsCode
        code={`<!-- Custom HTML block -->
<div data-snap-widget="calendar"
     data-snap-key="YOUR_EMBED_KEY"
     data-snap-theme="auto"></div>
<script src="${LOADER}" async></script>`}
      />
      <Note>
        For site-wide placement, paste the same snippet into your theme template (e.g.{" "}
        <code>page-template.php</code>) or a header/footer-scripts plugin. If your theme strips
        script tags, use a "custom code" plugin that supports them.
      </Note>

      <H2>Squarespace / Wix / Framer</H2>
      <p>
        Use each builder's embed block — Squarespace <strong>Code Block</strong>, Wix{" "}
        <strong>HTML iframe / Custom Element</strong>, Framer <strong>Embed</strong> — and paste
        the snippet.
      </p>
      <DocsCode
        code={`<div data-snap-widget="calendar-button"
     data-snap-key="YOUR_EMBED_KEY"
     data-snap-label="Book a session"></div>
<script src="${LOADER}" async></script>`}
      />
      <Note>
        Some builders sandbox embed blocks into blank iframes — if the widget doesn't appear, use
        the builder's site-level code injection (Squarespace: Settings → Advanced → Code
        Injection; Wix: Settings → Custom Code) with the placeholder <code>div</code> in the page
        body and the script tag in the footer.
      </Note>

      <p>
        Snippets are generated per studio with your key and theme at{" "}
        <a href="/dashboard/settings/embeds">Settings → Embeds</a>. Questions —{" "}
        <a href="mailto:hello@webcules.com">hello@webcules.com</a>.
      </p>

      <Related slugs={["booking-page", "domains", "brand"]} />
    </>
  );
}
