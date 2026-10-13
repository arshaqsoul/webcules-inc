/* Portfolio sites (WEB-346, Feature A) — the public portfolio surface,
 * written from the shipped code: routes, tier gates, the view budget and
 * the badge. The dashboard curation UI lands with WEB-347; this page
 * documents what a published portfolio IS today (truthfulness rules:
 * every URL, cap and gate below matches lib/plans-data.ts and
 * lib/repos/portfolio.ts). */
import { H2, H3, Note, Callout, Tier, Related } from "@/lib/docs/primitives";

export default function Portfolio() {
  return (
    <>
      <p>
        Your client gallery platform is also your portfolio. Curate collections
        from the photos already in Snap — no re-upload, no second site builder —
        and publish them as a portfolio site that renders from your library:
        hero, selected work, about, and a contact section with your booking
        link. Every image is served as a web-size preview derivative with the
        metadata stripped; your originals never leave the vault.
      </p>
      <Note>
        The Portfolio dashboard (picking photos, ordering, captions, themes) is
        rolling out in stages — the publishing API and the public site are live
        first. This page describes the public surface as it serves today.
      </Note>

      <H2>Where your portfolio lives</H2>
      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td>snaphq.app/portfolio/your-slug — with a &ldquo;Delivered by Snap&rdquo; badge</td>
            <td>Free</td>
          </tr>
          <tr>
            <td>your-slug.snaphq.app dedicated subdomain <Tier plan="lite" /></td>
            <td>Lite</td>
          </tr>
          <tr>
            <td>Your own domain (the $5 custom-domain add-on) <Tier plan="studio" /></td>
            <td>Studio</td>
          </tr>
        </tbody>
      </table>
      <p>
        Sites are public only when you publish them. A draft or unlisted
        portfolio answers 404 to the world — nothing is visible until you say
        so, and unpublishing takes effect on the next request, not eventually.
      </p>

      <H2>What each plan showcases</H2>
      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td>1 collection, 20 curated photos</td>
            <td>Free</td>
          </tr>
          <tr>
            <td>5 collections, 250 photos <Tier plan="lite" /></td>
            <td>Lite</td>
          </tr>
          <tr>
            <td>Unlimited collections, badge removed <Tier plan="studio" /></td>
            <td>Studio</td>
          </tr>
        </tbody>
      </table>

      <H3>The free image budget</H3>
      <p>
        A free portfolio includes 100,000 image views per month, counted
        server-side on every photo your site serves. If you run past it, your
        portfolio pauses for the rest of the month — visitors see a quiet
        &ldquo;temporarily unavailable&rdquo; card, never a broken page — and it
        resumes on its own on the first of the month. Paid plans have no view
        limit.
      </p>

      <H2>Themes, honestly gated</H2>
      <p>
        Portfolio themes speak the same design vocabulary as your galleries:
        background, spacing, corner radius and captions are free; typography
        (font, scale, letter-spacing) is <Tier plan="lite" />; fully custom
        colors are <Tier plan="studio" />. A locked control is visible and
        labeled — it never pretends to work.
      </p>

      <H2>Built to be found</H2>
      <p>
        Every portfolio is server-rendered HTML with a per-site sitemap at
        <code>/portfolio/your-slug/sitemap.xml</code>, structured data for
        search engines (LocalBusiness on the home page, ImageGallery on each
        collection), and a social share image drawn from your own curated
        photos.
      </p>

      <Callout title="Rights you already hold">
        Publishing asks you to confirm, once, that you hold the rights to
        display the photos you&rsquo;re making public. It&rsquo;s the same
        posture as your contracts — a one-time attestation recorded on the
        account.
      </Callout>

      <Related slugs={["gallery-delivery", "domains", "brand"]} />
    </>
  );
}
