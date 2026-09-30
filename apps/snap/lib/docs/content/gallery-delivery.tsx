/* Delivering galleries — docs-shell restructure of app/docs/gallery-delivery/page.tsx
 * (copy preserved) with the delivery machinery verified against code:
 * lib/shares/grants.ts, lib/shares/gallery-auth.ts, lib/gallery-downloads.ts,
 * lib/plans-data.ts, app/dashboard/galleries/page.tsx. */
import { H2, Note, Callout, Shot, Tier, Related } from "@/lib/docs/primitives";

export default function GalleryDelivery() {
  return (
    <>
      <p>
        Everything below ships on every gallery: verified email access, expiring links, one-click
        revocation, and unlimited viewing with no metering of your client&apos;s attention. The
        gallery&apos;s look lives in{" "}
        <a href="/docs/gallery-design">Gallery design &amp; styles</a>; this page is the delivery
        machinery around it.
      </p>

      <Shot
        src="/docs-shots/gallery-delivery/galleries.png"
        alt="The dashboard Galleries page — every client gallery link with its project, client, dates, and a status chip like Active or Expiring soon."
        grad="dusk"
        wide
      />

      <H2>Verified access, expiring links</H2>
      <p>
        You send a gallery from a project&apos;s <strong>Client gallery</strong> tab: pick the
        recipient and the scope (everything approved, or specific folders), see the exact image set
        about to ship, and send. Your defaults from{" "}
        <a href="/dashboard/settings/delivery">Settings → Delivery</a> prefill the expiry and the
        download permission, with a per-send override. The client opens the link and verifies their
        email with a one-time six-digit code; their browser stays verified for 30 days while the
        gallery&apos;s status is re-checked on every request — revoking cuts off an open session
        immediately.
      </p>
      <p>
        Expiry is yours to set — 7, 30, 60, 90, or 365 days, or no expiry — and you can change it,
        revoke, or regenerate the link at any moment (a regenerated link kills the old one and
        inherits the photos and settings). The <a href="/dashboard/galleries">Galleries</a> page
        lists every link with its state:
      </p>
      <table>
        <thead>
          <tr>
            <th>State</th>
            <th>What it means</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Active</strong></td>
            <td>Live and serving.</td>
          </tr>
          <tr>
            <td><strong>Expiring soon</strong></td>
            <td>Less than seven days left — extend if the client needs longer.</td>
          </tr>
          <tr>
            <td><strong>Expired</strong></td>
            <td>Past its expiry; extend to bring it back.</td>
          </tr>
          <tr>
            <td><strong>Revoked</strong></td>
            <td>Dead immediately — even mid-session.</td>
          </tr>
          <tr>
            <td><strong>Regenerated</strong></td>
            <td>Superseded by a fresh link; the old URL is dead.</td>
          </tr>
        </tbody>
      </table>
      <Note>
        Active galleries are capped by plan — five on Free, fifteen on Lite, unlimited on Studio
        and above — and closing one frees its slot.
      </Note>

      <H2>Slideshows with your music</H2>
      <p>
        One tap plays a full-screen slideshow — crossfades, optional motion, your pace. Add a track
        you own the rights to (MP3/AAC/M4A, ≤ 15 MB) and it streams with the show; a vertical 9:16
        mode is built for watching on phones and saving to Stories. We don&apos;t license music for
        you — bring your own and the rights stay yours (you confirm ownership on upload; it&apos;s
        recorded).
      </p>

      <H2>Downloads under your control</H2>
      <p>
        Per gallery: allow downloads (or not), set a 4–8 digit PIN <Tier plan="lite" />, cap how
        many photos a client can pull, offer a web-size option <Tier plan="lite" />, and require
        your approval before bulk requests <Tier plan="studio" />. Whole-gallery, favorites, or
        folder ZIPs are built overnight and emailed as links that live as long as the gallery — the
        link never outlives your revocation.
      </p>

      <H2>Social sharing that markets you</H2>
      <p>
        Clients share a photo with the native share sheet; the recipient gets a beautiful card with
        the photo (watermarked if you watermark) and a &ldquo;book your session&rdquo; link to your
        booking page. Every shared link is a child of the gallery — revoke the gallery and every
        card dies with it.
      </p>

      <H2>The client app (/my)</H2>
      <p>
        Your clients verify once by email and get a home for every gallery you&apos;ve ever sent
        them — installable to their home screen with your name and icon, working offline for the
        photos they&apos;ve opened, with favorites that sync when they&apos;re back. On Pro, it
        even runs on your own custom domain. It&apos;s a web app, not an App Store app — no store
        review, instant updates, ~95% of the value at ~zero cost.
      </p>

      <H2>Insights, not surveillance</H2>
      <p>
        You see who viewed, what they favorited, which photos they returned to, and how far your
        shared photos traveled — counted per client email, visible only to you. No mouse-tracking,
        no time-on-photo theater, no third-party analytics scripts anywhere. Nudge a quiet client
        with one click when a deadline matters.
      </p>

      <H2>Honest limits</H2>
      <Callout tone="info" title="What Snap does not do">
        <ul>
          <li>No native App Store app (PWA instead — by design; revisit with demand).</li>
          <li>No music catalog — BYO tracks with your rights, recorded at upload.</li>
          <li>
            Videos deliver bit-exact, no transcoding — export H.264 MP4 for universal playback;
            HEVC may not play everywhere. 4 GB per file (see{" "}
            <a href="/docs/video">Films &amp; video delivery</a>).
          </li>
          <li>
            ZIP archives deliver photo originals byte-exact; the per-photo EXIF strip applies to
            individual downloads and previews.
          </li>
          <li>
            Offline caches on a client&apos;s device can&apos;t be wiped retroactively by anyone
            (true of every platform) — expiry, watermarks, and revocation are the real protection
            layers, and our app purges its caches on the next launch after a gallery dies.
          </li>
          <li>
            Bulk ZIPs build on a daily schedule — requests made today are usually in the
            client&apos;s inbox within hours, always within a day.
          </li>
        </ul>
      </Callout>

      <Related slugs={["gallery-design", "video", "protection", "client-portal"]} />
    </>
  );
}
