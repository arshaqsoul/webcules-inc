/* Brand & white-label — Settings → Brand: accent, font, logo, the generated
 * asset kit, the white-label switch, watermarks and gallery protection.
 * Facts from components/settings-brand.tsx, white-label-card.tsx,
 * watermark-card.tsx, lib/brand-assets.ts, lib/branding.ts and
 * lib/watermark.ts (WEB-234–244). */
import { H2, H3, Note, Shot, Tier, Related } from "@/lib/docs/primitives";

export default function Brand() {
  return (
    <>
      <p>
        One screen decides what your clients see: <a href="/dashboard/settings/brand">Settings → Brand</a>{" "}
        carries your accent, your logo, and — on Studio and above — the switch that removes Snap
        from every client surface. Everything here applies studio-wide, the moment you save.
      </p>

      <Shot
        src="/docs-shots/brand/settings.png"
        alt="Settings → Brand: the accent picker, font field, logo upload, white-label card, and the watermark card with its live preview."
        grad="ember"
      />

      <H2>Where your brand appears</H2>
      <ul>
        <li>
          <strong>Emails</strong> — your accent colors every automatic email, and your logo tops
          the header once the asset kit is generated.
        </li>
        <li>
          <strong>Galleries</strong> — the footer, the browser tab title, the favicon, and the
          share card previews on links.
        </li>
        <li>
          <strong>Invoices</strong> — the PDF header carries your accent, and your logo once
          generated.
        </li>
        <li>
          <strong>Booking page, embeds, portal and app</strong> — your accent and logo on the{" "}
          <a href="/docs/booking-page">booking page</a> and embedded widgets, the{" "}
          <a href="/docs/client-portal">client portal</a> cards, and the installed app icon.
        </li>
      </ul>

      <H2>Setting it up</H2>
      <p>
        Pick a <strong>brand accent</strong> (color picker or hex), an optional{" "}
        <strong>font stack</strong>, and upload a <strong>logo</strong> (≤512 KB PNG, JPG, WebP or
        SVG). Widgets get a light/dark/auto theme, and an advanced JSON panel exposes widget
        tokens — radius, surfaces, borders — with a live preview that reloads on save.
      </p>

      <H3>
        The brand asset kit <Tier plan="studio" />
      </H3>
      <p>
        From the one logo, Snap generates a matching kit in your browser: favicon, apple-touch
        icon, email header, social share card, and the watermark source. It runs automatically
        after a logo upload on white-label plans, and the card keeps preview chips and a
        regenerate button for later.
      </p>

      <H2>
        White-label <Tier plan="studio" />
      </H2>
      <p>
        One toggle, self-serve, reversible at any time — nothing is deleted when you flip it. The
        entitlement comes with Studio; the switch is yours. What changes:
      </p>
      <table>
        <thead>
          <tr>
            <th>Client surface</th>
            <th>Without</th>
            <th>With</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Gallery footer</td>
            <td>Delivered by you via Snap</td>
            <td>© your studio</td>
          </tr>
          <tr>
            <td>Emails</td>
            <td>Snap wordmark, "via Snap"</td>
            <td>Your logo, "Sent by your studio"</td>
          </tr>
          <tr>
            <td>Booking page</td>
            <td>"…via Snap"</td>
            <td>Your brand only</td>
          </tr>
          <tr>
            <td>Invoice PDF</td>
            <td>Accent header</td>
            <td>Your logo + accent</td>
          </tr>
          <tr>
            <td>Browser tab</td>
            <td>Snap</td>
            <td>Gallery · your studio</td>
          </tr>
        </tbody>
      </table>
      <p>
        For your own hostname in front of it all, see <a href="/docs/domains">custom domains</a>.
      </p>

      <H3>
        Watermarks <Tier plan="studio" />
      </H3>
      <p>
        The watermark card lives here too: a logo in one corner, a tiled logo, or your studio name
        as text — with opacity, scale, and margin sliders over a live canvas preview. Watermarks
        apply to <strong>client gallery previews only</strong>: originals and standard downloads
        stay clean. A <strong>proofing</strong> gallery flips that per grant — downloads deliver
        the watermarked preview instead of the original, for pre-sale selects. Changing the
        config regenerates watermarked previews for existing photos right in the browser, in a
        resumable pass.
      </p>

      <H3>Gallery protection</H3>
      <p>
        Also on white-label plans: a toggle that disables right-click, drag-to-desktop, and
        long-press save menus on gallery photos. It deters casual saving; like every platform it
        cannot prevent screenshots, and Snap won't pretend otherwise. The full, straight story is
        in <a href="/docs/protection">photo protection</a>.
      </p>
      <Note>
        Saved email replies and automatic email copy moved to Templates → Emails; brand settings
        are only about how things look.
      </Note>

      <Related slugs={["domains", "client-portal", "gallery-delivery", "protection"]} />
    </>
  );
}
