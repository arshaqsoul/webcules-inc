# @webcules/snap-react

React components for embedding [Snap](https://snaphq.app) widgets — the contact form, the booking calendar and the booking button — on top of the framework-free Snap embed loader.

The plain script-tag snippet from **Settings → Embeds** in your Snap dashboard works in any framework (Astro, plain HTML, WordPress…). This package is for React apps that prefer components over global script tags, with correct mount/unmount lifecycle (StrictMode-safe).

## Install

```bash
npm install @webcules/snap-react
```

Requires React 18 or 19. No other runtime dependencies — the loader script (~2KB) is injected from Snap's CDN on first mount.

## Usage

```tsx
import { SnapContactForm, SnapCalendar, SnapCalendarButton } from "@webcules/snap-react";

// Inline inquiry form
<SnapContactForm apiKey="YOUR_EMBED_KEY" theme="auto" />

// Inline booking calendar
<SnapCalendar apiKey="YOUR_EMBED_KEY" />

// Button that opens the calendar in a modal
<SnapCalendarButton apiKey="YOUR_EMBED_KEY" label="Book a session" />
```

### Next.js (App Router)

The components use hooks — mark the file as a client component:

```tsx
"use client";
import { SnapCalendar } from "@webcules/snap-react";

export function Booking() {
  return <SnapCalendar apiKey={process.env.NEXT_PUBLIC_SNAP_KEY!} />;
}
```

### Options

| Prop | Type | Description |
| --- | --- | --- |
| `apiKey` | `string` | Studio embed key (Settings → Embeds) |
| `theme` | `"light" \| "dark" \| "auto"` | Widget theme; omit for the studio default |
| `accent` | `string` | Brand accent override (6-digit hex) |
| `radius` | `string` | Corner radius (`"12px"`, `"0.75rem"`, `"50%"`) |
| `fontFamily` | `string` | CSS font stack override |
| `inherit` | `boolean` | Sample the host page's font/text/background so the widget blends in |
| `label` | `string` | Button label (`SnapCalendarButton` only) |

### CSP / allowed origins

Snap widgets render inside an iframe protected by `frame-ancestors`. Add your site's origin under **Settings → Embeds → Allowed embed sites** in the Snap dashboard, or the iframe will be blocked by the browser. If your site ships a CSP, allow `script-src https://snaphq.app` and `frame-src https://snaphq.app`.

Upgrading from 0.1.x: the loader moved from `snap.webcules.com` to `snaphq.app`. Sites still on 0.1.x keep working, because the old address keeps serving the same loader, but update your CSP if you set one.
