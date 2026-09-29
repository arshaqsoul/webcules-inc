/* Gallery delivery guide (WEB-267) — one honest page for the whole epic:
 * what each feature does, what it never does, and the real limits. Public. */
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Client gallery delivery",
  description:
    "How Snap delivers client galleries: designed covers and layouts, slideshows with your own music, films and reels, controlled downloads with PINs and bulk ZIPs, social share cards, an installable client app, and honest limits throughout.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[17px] font-semibold tracking-[-.3px] text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-subtle">{children}</div>
    </section>
  );
}

export default function GalleryDeliveryDocsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-[-.8px] text-ink">Client gallery delivery</h1>
        <p className="text-sm leading-relaxed text-ink-subtle">
          The gallery is where your client falls in love with the work — and where their friends meet your studio. Everything below ships on every
          gallery: verified email access, expiring links, one-click revocation, and unlimited viewing with no metering of your client&apos;s attention.
        </p>
        <p className="text-xs text-ink-tertiary">
          Also see <Link href="/docs/protection" className="underline underline-offset-2">protection, honestly</Link> and{" "}
          <Link href="/docs/video" className="underline underline-offset-2">films &amp; video delivery</Link>.
        </p>
      </header>

      <Section title="Design: covers, layouts, themes">
        <p>
          Pick a cover photo and drag its focal point, choose a style (full-bleed, slow Ken Burns motion, or a split title panel), and set the layout —
          uniform grid, natural masonry, or editorial cascade. Light, dark, or your-brand tinted themes. Save any combination as a preset and pin it as
          your studio default so new galleries start styled. Presets live in your{" "}
          <Link href="/dashboard/templates" className="underline underline-offset-2">template library</Link>.
        </p>
      </Section>

      <Section title="Slideshows with your music">
        <p>
          One tap plays a full-screen slideshow — crossfades, optional motion, your pace. Add a track you own the rights to (MP3/AAC/M4A, ≤ 15 MB) and
          it streams with the show; a vertical 9:16 mode is built for watching on phones and saving to Stories. We don&apos;t license music for you —
          bring your own and the rights stay yours (you confirm ownership on upload; it&apos;s recorded).
        </p>
      </Section>

      <Section title="Downloads under your control">
        <p>
          Per gallery: allow downloads (or not), set a 4–8 digit PIN, cap how many photos a client can pull, offer a web-size option, and require your
          approval before bulk requests. Whole-gallery or folder ZIPs are built overnight and emailed as links that live as long as the gallery — the
          link never outlives your revocation.
        </p>
      </Section>

      <Section title="Social sharing that markets you">
        <p>
          Clients share a photo with the native share sheet; the recipient gets a beautiful card with the photo (watermarked if you watermark) and a
          &ldquo;book your session&rdquo; link to your booking page. Every shared link is a child of the gallery — revoke the gallery and every card
          dies with it.
        </p>
      </Section>

      <Section title="The client app (/my)">
        <p>
          Your clients verify once by email and get a home for every gallery you&apos;ve ever sent them — installable to their home screen with your
          name and icon, working offline for the photos they&apos;ve opened, with favorites that sync when they&apos;re back. On Pro, it even runs on
          your own custom domain. It&apos;s a web app, not an App Store app — no store review, instant updates, ~95% of the value at ~zero cost.
        </p>
      </Section>

      <Section title="Insights, not surveillance">
        <p>
          You see who viewed, what they favorited, which photos they returned to, and how far your shared photos traveled — counted per client email,
          visible only to you. No mouse-tracking, no time-on-photo theater, no third-party analytics scripts anywhere. Nudge a quiet client with one
          click when a deadline matters.
        </p>
      </Section>

      <Section title="Honest limits">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>No native App Store app (PWA instead — by design; revisit with demand).</li>
          <li>No music catalog — BYO tracks with your rights, recorded at upload.</li>
          <li>Videos deliver bit-exact, no transcoding — export H.264 MP4 for universal playback; HEVC may not play everywhere. 4 GB per file.</li>
          <li>ZIP archives deliver photo originals byte-exact; the per-photo EXIF strip applies to individual downloads and previews.</li>
          <li>Offline caches on a client&apos;s device can&apos;t be wiped retroactively by anyone (true of every platform) — expiry, watermarks, and revocation are the real protection layers, and our app purges its caches on the next launch after a gallery dies.</li>
          <li>Bulk ZIPs build on a daily schedule — requests made today are usually in the client&apos;s inbox within hours, always within a day.</li>
        </ul>
      </Section>
    </div>
  );
}
