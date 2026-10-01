/* Releases — Snap's public changelog. One entry per version tag, newest
 * first; the entries are the release-note paragraphs of each release commit
 * (see AGENTS.md → "Commits, releases & version tags"). Facts from the
 * shipped features' code; dates are the tag dates. */
import { H2, Note } from "@/lib/docs/primitives";

function Release({
  version,
  date,
  children,
}: {
  version: string;
  date: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-hairline pb-8 last:border-0">
      <H2>
        v{version} <span className="ml-1 font-normal text-ink-tertiary">· {date}</span>
      </H2>
      <div className="text-sm leading-relaxed text-ink-subtle">{children}</div>
    </section>
  );
}

export default function Releases() {
  return (
    <>
      <p>
        Every tagged release of Snap, newest first — written for photographers, not engineers.
        When something changes in a way you can see or feel, it lands here.
      </p>
      <Note>
        Snap deploys continuously; this page covers the changes worth announcing. Small fixes and
        polish fold into the next entry rather than getting their own.
      </Note>

      <Release version="0.2.0" date="October 1, 2026">
        <p>
          <strong>Security, teams, and a gallery that impresses.</strong> Studios can now lock
          their account with two-factor authentication, invite their team with real roles, and
          see — really see — what a client will see before sending a gallery.
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>
            <strong>Two-factor authentication</strong> (Settings → Security): scan a QR code with
            any authenticator app, keep ten single-use backup codes, and rest easy — enabling it
            signs out every other session, and recovery has no automated bypass.
          </li>
          <li>
            <strong>Team &amp; roles</strong> (Settings → Team): invite an admin (studio manager)
            or a member (second shooter) with seat limits per plan — Free 1 · Lite 1 · Studio 3 ·
            Pro 10. Members work shoots and galleries but never see billing or the RAW vault
            unless you flip the toggle.
          </li>
          <li>
            <strong>Notification controls</strong> (Settings → Notifications): choose which alerts
            reach your inbox — inquiries, bookings, contract signatures, storage warnings. Your
            clients&apos; emails always send.
          </li>
          <li>
            <strong>Delivery defaults</strong> (Settings → Delivery): pre-fill gallery expiry and
            the download toggle for every new gallery you share.
          </li>
          <li>
            <strong>CSV import</strong> (Leads → Import CSV): bring your client list and pipeline
            from another platform — column mapping, duplicate detection, a validate-first dry
            run, and 7-day undo.
          </li>
          <li>
            <strong>Business identity</strong> (Settings → General): your legal name, address and
            tax registration now print on invoices and contracts — including the
            &quot;GST reg. no.&quot; detail accountants ask about.
          </li>
          <li>
            <strong>Gallery preview</strong>: a Preview button on the Gallery tab opens exactly
            what your client will see — no link needed, nothing sent, views don&apos;t count.
          </li>
          <li>
            <strong>Gallery covers for everyone</strong>: every studio can put a photo on the
            cover (with soft dark edges — a vignette — and a title). Studio plans add a swipeable
            hero carousel of up to six photos and control over how many photos show per row;
            fewer columns, bigger photos.
          </li>
          <li>
            <strong>A smarter default look</strong>: galleries that were never configured now
            open on a designed hero with the event date and photo count, and foldered deliveries
            group under clean section headers.
          </li>
          <li>
            <strong>New docs section</strong>: the guides you&apos;re reading launched with
            search, per-page tables of contents, and honest answers written from the code.
          </li>
        </ul>
      </Release>

      <Release version="0.1.0" date="September 29, 2026">
        <p>
          <strong>Snap launches.</strong> The whole studio in one place: an embedded booking page
          with payments, leads that become projects, drag-and-drop curation with folders, client
          galleries with OTP-verified links and favorites, contracts with e-signature, invoices,
          a RAW vault for originals, white-labeling and custom domains on higher tiers, and
          Stripe live for checkout and payouts.
        </p>
      </Release>
    </>
  );
}
