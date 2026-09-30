/* Photo protection, honestly — docs-shell restructure of app/docs/protection/page.tsx
 * (facts preserved), verified against lib/watermark.ts + lib/branding.ts
 * (whiteLabel = Studio/Pro), components/watermark-card.tsx, settings-brand.tsx
 * (deterrents.rightClick toggle), and lib/shares/gallery-auth.ts (access log). */
import { H2, Callout, Note, Shot, Tier, Related } from "@/lib/docs/primitives";

export default function Protection() {
  return (
    <>
      <p>
        Every gallery platform markets &ldquo;protection.&rdquo; Some of it is real, and some of
        it is theater — nobody can stop a client from photographing their screen with a phone.
        This page is the straight version: the layers Snap actually gives you, what each one does,
        and what none of them can do.
      </p>

      <H2>Galleries serve previews, not originals</H2>
      <p>
        Client galleries render compressed preview images — around 1600px, tuned for screens — not
        your deliverable files. A saved preview is a ~1600px image. Full-resolution originals are
        only served through the explicit download action you control, per gallery.
      </p>

      <H2>Verified, expiring, revocable links</H2>
      <p>
        Every gallery lives behind an email-verified link — a one-time six-digit code, not a
        guessable password. You set the expiry, you can revoke or rotate the link at any moment,
        and access is logged: views, OTP outcomes, downloads, PIN failures, even shared-photo
        views. See <a href="/docs/gallery-delivery">Delivering galleries</a> for the controls.
      </p>

      <H2>Watermarks <Tier plan="studio" /></H2>
      <p>
        Your logo or studio name — corner, tiled, or text — composited onto gallery previews.
        Configure it once in{" "}
        <a href="/dashboard/settings/brand">Settings → Brand</a> (with a live preview and sliders
        for opacity, scale, and margin), and override per project where a gallery shouldn&apos;t
        carry it. Downloads stay clean by default, and <strong>proofing galleries</strong> flip
        that: clients get watermarked files until they buy, then you deliver the clean set.
      </p>

      <Shot
        src="/docs-shots/protection/watermark-card.png"
        alt="The Watermark card in Settings → Brand — corner/tiled/text mode picker, opacity, scale and margin sliders, and a live canvas preview of the mark on a sample photo."
        grad="night"
      />

      <H2>Right-click &amp; long-press deterrence <Tier plan="studio" /></H2>
      <p>
        One toggle in Settings → Brand disables right-click menus, drag-to-desktop, and long-press
        save prompts on gallery photos. It stops the casual right-click-save. It does not stop
        screenshots, screen recording, or a camera pointed at the screen — and any platform that
        tells you otherwise is selling theater.
      </p>

      <H2>The honest summary</H2>
      <Callout tone="warn" title="Effort, raised — never impossibility">
        <p>
          Layered protection raises the effort required to take what isn&apos;t theirs — and gives
          you an audit trail when it matters. It cannot make taking impossible; nothing can.
          Watermark your previews, use proofing galleries for pre-sale delivery, revoke links when
          a gallery&apos;s job is done — and deliver your paying clients the clean,
          full-resolution files they paid for.
        </p>
      </Callout>
      <Note>
        Per-gallery download defaults (expiry, downloads on or off) live in{" "}
        <a href="/dashboard/settings/delivery">Settings → Delivery</a>; the watermark and
        deterrence toggles live in <a href="/dashboard/settings/brand">Settings → Brand</a>.
      </Note>

      <Related slugs={["gallery-delivery", "gallery-design", "brand"]} />
    </>
  );
}
