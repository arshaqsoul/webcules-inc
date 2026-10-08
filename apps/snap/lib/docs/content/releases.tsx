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

      <Release version="0.11.3" date="October 8, 2026">
        <p>
          <strong>Your own domain works for sign-in codes and forms too.</strong> On a custom
          domain, the gallery sign-in, contract signing, client portal and questionnaires now
          show their human check without any extra setup on our side, and there is no limit on
          how many studios can connect a domain.
        </p>
      </Release>

      <Release version="0.11.2" date="October 8, 2026">
        <p>
          <strong>Connecting your own domain finishes by itself.</strong> After you add the
          CNAME and the ownership record, the certificate for your domain is now issued
          automatically. Previously it could sit on &ldquo;Certificate issuing&rdquo; forever
          waiting for a record the settings page never showed.
        </p>
      </Release>

      <Release version="0.11.1" date="October 8, 2026">
        <p>
          <strong>Emails now come from snaphq.app.</strong> Gallery links, login codes, booking
          confirmations and replies are sent from hello@snaphq.app, and customer replies thread
          into your Snap inbox through snaphq.app addresses.
        </p>
        <p>
          <strong>Heads up:</strong> reply addresses from emails sent before this release no
          longer work. Links inside those emails still open normally.
        </p>
      </Release>

      <Release version="0.11.0" date="October 8, 2026">
        <p>
          <strong>Snap has a new home: snaphq.app.</strong> Galleries, booking pages, the client
          portal and every new link and email now use snaphq.app, and the &ldquo;Delivered by
          Snap&rdquo; badge shows it too.
        </p>
        <p>
          <strong>Nothing you already sent breaks.</strong> Every link you have emailed from
          snap.webcules.com keeps working, and so does any embed code already on your website.
          You will be asked to sign in once more on the new address.
        </p>
      </Release>

      <Release version="0.10.0" date="October 7, 2026">
        <p>
          <strong>Simpler pricing: Free, Lite and Studio.</strong> The pricing page now shows three
          plans instead of four, with Studio highlighted. Prices and what each plan includes are
          unchanged.
        </p>
        <p>
          <strong>Teams and bigger studios: talk to us.</strong> If you run a team, need more than
          1 TB of storage or want several custom domains, book a call and we will set up a plan
          that fits your studio. Studios already on Pro keep everything they have today.
        </p>
        <p>
          <strong>Clearer upgrade prompts.</strong> White-label, watermarks and custom domains now
          point straight to Studio, with the $5/mo domain add-on called out.
        </p>
      </Release>

      <Release version="0.9.1" date="October 6, 2026">
        <p>
          <strong>Clearer Studio-only watermarks.</strong> On Free and Lite, a project&rsquo;s
          watermark control now says &ldquo;Watermarks are a Studio feature&rdquo; with an Upgrade
          link, instead of letting you pick &ldquo;Always watermark&rdquo; and quietly doing
          nothing for your clients.
        </p>
        <p>
          <strong>Smoother upgrades.</strong> Upgrading to a paid plan no longer stops with an
          error if your saved billing record can&rsquo;t be found &mdash; Snap now sets it up
          again and carries on to checkout.
        </p>
      </Release>

      <Release version="0.9.0" date="October 4, 2026">
        <p>
          <strong>Galleries that fill the phone.</strong> Open any gallery on a phone and the photos
          are the stars: grid layouts show at most two columns, masonry galleries stack as one
          full-width column so landscape shots keep their shape, and photos sit 4px apart like a
          camera roll — whatever spacing the template asks for. The Mobile view in the preview (the
          phone-shaped frame) now renders exactly what a real phone shows, so what you check is what
          your client gets. The template cards draw the template&rsquo;s real layout too — a masonry
          template card finally looks like masonry, and every card shows its own canvas, colors and
          corners.
        </p>
      </Release>

      <Release version="0.8.1" date="October 4, 2026">
        <p>
          <strong>Arranging photos is now a proper workspace.</strong> Press Share in the Files tab
          and you can set the photo order - and add a welcome collage - right there, before anything
          is sent: Photo order menu, or Arrange photos to open a full-screen view with big
          thumbnails (and a size slider), where the other photos slide out of the way live as you
          drag. Select several photos to move them together, double-click any photo to see it full
          size. The same workspace opens from Arrange on a sent gallery, where your changes are saved once when you press Save & close. Also fixed: the dragged
          photo no longer jumps to the corner of the screen.
        </p>
      </Release>

      <Release version="0.8.0" date="October 4, 2026">
        <p>
          <strong>A welcome collage for your client - on every plan.</strong> When you send a
          gallery you can now head the &ldquo;your photos are ready&rdquo; email - and, if you tick
          the box, the top of the gallery - with a picture of your own: upload an image, or build a collage in Snap by
          picking up to six photos and choosing a layout, shape, spacing, background and caption.
          Change or remove it later with the Collage button on any sent gallery; revoking the
          gallery stops the picture loading in old emails.
        </p>
      </Release>

      <Release version="0.7.0" date="October 4, 2026">
        <p>
          <strong>Arrange the photos your client sees - on every plan.</strong> Sort a gallery by
          filename (numbers in human order, so IMG_2 comes before IMG_10), upload date, date taken,
          color (a rainbow from reds to purples, then black &amp; white), or shuffle it - then drag
          photos, or groups of photos, into exactly the order you want. Pick the order when you send
          a gallery, or press Arrange on any sent gallery: the change is live, with nothing to
          re-send, and renewing a link keeps your order. Also fixed: sending, renewing or revoking a
          gallery of 99 or more photos, and bulk actions on 100+ selected photos, could fail - a
          500-photo wedding now sends in one go.
        </p>
      </Release>

      <Release version="0.6.0" date="October 4, 2026">
        <p>
          <strong>Download all, instantly, on every plan.</strong> Clients press Download and their
          files start saving right away - no more waiting for an overnight ZIP and an email. It
          works for the whole gallery, a folder, or favorites, includes films, and has no photo
          limit: a 20&nbsp;GB wedding downloads as a few ZIP parts of about 2&nbsp;GB each that
          open on any computer or phone, so a dropped connection only costs one part. Free
          galleries get it too. Revoking or expiring a gallery now stops downloads even while
          they&apos;re in progress, and renewing the link brings them back. Proofing galleries
          deliver watermarked previews only, and original photos leave without location data.
          Studios that require approval now email the client the moment they approve.
        </p>
      </Release>

      <Release version="0.5.4" date="October 2, 2026">
        <p>
          <strong>Safety release.</strong> A full independent review of every module found and
          fixed five serious issues before anyone could trip on them: the signup API no longer
          accepts a client-chosen plan (paid tiers now only ever arrive through a completed
          checkout), a cross-studio write hole in project payments is closed, gallery
          email-verification now applies to exactly the gallery whose link was opened (not any
          gallery you happen to hold a link to), dormant-studio cleanup can no longer touch
          photos still under an active gallery link, and the free tier can no longer smuggle
          custom designs past the builder gate by faking a template marker. Also in: Stripe
          webhook events now retry on failure instead of being silently dropped, invoice payment
          links only settle on actually-captured matching amounts, seeded starter templates no
          longer consume your plan&apos;s template slots, template duplication respects plan
          limits, team members are properly role-gated out of settings changes, booking
          confirmations can&apos;t resurrect canceled bookings, proofing galleries never serve
          the clean original inline, and view counting can&apos;t be skipped with range-request
          tricks. Deferred findings are tracked and linked (WEB-325).
        </p>
      </Release>
      <Release version="0.5.3" date="October 1, 2026">
        <p>
          Fixed: on Studio and Pro (unlimited linked studios), the sidebar claimed &quot;1 studio
          on this plan&quot; and hid the add-studio button — unlimited was being misread as a
          limit of one. Adding studios works as it always should have.
        </p>
      </Release>
      <Release version="0.5.2" date="October 1, 2026">
        <p>
          Long studio names now behave in the sidebar: instead of running under the collapse
          button, the name shortens with an ellipsis and the chevron stays put — in the desktop
          sidebar and the mobile menu alike. The full name is still one hover away, and every
          studio is listed in full when you open the switcher.
        </p>
      </Release>
      <Release version="0.5.1" date="October 1, 2026">
        <p>
          Polish from the Template Studio review: buttons that fill with your brand color — the
          template picker&apos;s Apply, the applied badge, category chips, the builder entry — now
          pick a label color that reads on it (white on dark accents, ink on light ones), so a
          light gold or oak brand never produces invisible white-on-light text. The applied
          template state is now a solid, high-contrast badge instead of a dimmed button, and
          hero titles over bright photos carry a soft shadow.
        </p>
      </Release>
      <Release version="0.5.0" date="October 1, 2026">
        <p>
          <strong>Template Studio is here.</strong> Ten designer gallery templates — wedding,
          family, party, newborn, corporate, editorial — now ship with Snap, free on every plan.
          Pick a look, preview it with your own photos, apply it in one click. And on Lite and
          above, the new page builder takes any template (or a blank page) and makes it yours:
          drag sections around, choose from twelve bundled fonts, set your colors, even place
          photos freely in a collage.
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>
            <strong>The template grid.</strong> Every project&apos;s Client gallery tab now opens
            with real photographic previews — browse by category (Wedding, Family, Party,
            Corporate, Editorial, Minimal), hover to Preview a template rendered with{" "}
            <em>your</em> photos, then Apply. Changed your mind? Undo restores your previous
            design. Applying never touches photos, favorites, or delivery settings.
          </li>
          <li>
            <strong>The page builder (Lite).</strong> A gallery page is now a stack of sections —
            hero, gallery, slideshow, favorites, text, contact — that you drag to reorder, edit
            in a live inspector, and bind to exactly the photos each section should show (all,
            one folder, your N-star picks, or hand-picked). Undo/redo, autosaved drafts, and a
            stale-session guard keep it safe.
          </li>
          <li>
            <strong>Typography &amp; theme (Lite).</strong> Twelve self-hosted font families
            (Playfair Display, Cormorant Garamond, Space Grotesk, Work Sans…), a type-scale
            slider, letter-spacing, and page/text/accent colors with one-click match-my-brand.
            Fonts load from Snap itself — no external font service ever touches your
            client&apos;s gallery.
          </li>
          <li>
            <strong>Collage sections (Studio).</strong> Drag photos anywhere on the canvas,
            resize, rotate, layer — free positioning that scales from phone to desktop. Twelve
            photos per collage keeps it a composition, not a pile.
          </li>
          <li>
            <strong>Fixed: the split cover.</strong> Galleries using the split cover style now
            truly show photo and title side-by-side — a layout rule with an invalid character
            had quietly stacked them since the design system launched.
          </li>
          <li>
            <strong>New studios</strong> get a &quot;Pick a gallery template&quot; step in the
            setup guide — two minutes after signup, the demo gallery can look like a magazine.
          </li>
        </ul>
      </Release>
      <Release version="0.4.0" date="October 1, 2026">
        <p>
          <strong>The inbox is home.</strong> Every conversation now lives in one place: the lead
          thread moved in (with all its history), replies send from addresses that thread
          perfectly in Gmail and Outlook, and unmatched email lands in a triage list you can
          attach to the right client in one click.
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>
            <strong>Leads moved into the Inbox.</strong> The dashboard now reads Inbox →
            Projects → Calendar → Leads; the Leads page keeps the pipeline and conversion, and
            each lead links straight into its conversation (exactly one reply composer in the
            product — every past message is there).
          </li>
          <li>
            <strong>Replies that thread.</strong> Messages send from a unique per-conversation
            Snap address with full threading headers — answers find their thread even when mail
            clients strip everything. Bounced replies are marked on the thread, tracking pixels
            are stripped from stored email, and mail over 25&nbsp;MiB is politely declined.
          </li>
          <li>
            <strong>Needs triage.</strong> Email that matches no conversation waits in its own
            tab — attach it to a client, lead or project with one click.
          </li>
          <li>
            <strong>Reply mirroring</strong> (Settings → Notifications, default on): client
            replies also land in your own inbox, tagged X-Snap, while you build trust in Snap's.
          </li>
          <li>
            <strong>Filter menu + resizable split.</strong> Linear-style filter popover (press{" "}
            <strong>F</strong>) replaces the chips, and the divider between the list and the
            conversation drags to your preferred width — Snap remembers it.
          </li>
          <li>
            <strong>Snooze is a Lite feature.</strong> The inbox itself — reading, replying,
            events, search, triage — is free on every plan; snoozing a conversation until
            tomorrow morning joins Lite.
          </li>
        </ul>
      </Release>

      <Release version="0.3.1" date="October 1, 2026">
        <p>
          <strong>Inbox, faster.</strong> The inbox gains its triage layer: four tabs (Unread ·
          All · Needs reply · Needs triage), the full keyboard shortcut set Linear made famous,
          snooze with reasons, search, and an unread badge in the sidebar that follows you
          everywhere — including the browser tab title.
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>
            Drive it from the keyboard: <strong>j/k</strong> to move, <strong>Enter</strong> to
            open, <strong>U</strong> to mark read, <strong>H</strong> to snooze,{" "}
            <strong>Backspace</strong> to delete — plus <strong>⌘K</strong> for the command
            menu and <strong>?</strong> for the shortcut sheet.
          </li>
          <li>
            <strong>Snooze</strong> an item until later today, tomorrow morning, next week or a
            custom moment — it hides, then resurfaces unread. Nothing is ever lost.
          </li>
          <li>
            Filter chips by kind (emails, bookings, contracts, payments, galleries, inquiries)
            and search across titles and previews.
          </li>
        </ul>
      </Release>

      <Release version="0.3.0" date="October 1, 2026">
        <p>
          <strong>The Inbox.</strong> Snap now has one place for everything that needs you:
          client emails and studio activity — bookings, contracts, payments, galleries — in a
          single stream, with replies that send from your own studio address.
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>
            <strong>One timeline per client</strong> (Dashboard → Inbox): conversations sit
            next to compact event cards — &ldquo;Booking rescheduled&rdquo;, &ldquo;Invoice
            paid&rdquo;, &ldquo;Client opened their gallery&rdquo; — each linking straight to
            the booking, project or gallery it refers to.
          </li>
          <li>
            <strong>Reading email, safely:</strong> client emails render in a locked frame with
            remote images blocked until you allow them (tracking pixels never fire by default),
            and the quoted-reply walls collapse behind a &ldquo;Show trimmed content&rdquo;
            toggle — nothing is ever cut from the record, just out of your way.
          </li>
          <li>
            <strong>Reply right there:</strong> replies go out from your studio&rsquo;s own Snap
            address with your studio&rsquo;s name, so answers thread back into the same
            conversation. Saved snippets and merge fields resolve per client, your business
            signature is appended, the client&rsquo;s gallery link is one click away, and a copy
            lands in your own inbox by default while you build trust in the new surface.
          </li>
          <li>
            <strong>Finer notification controls</strong> (Settings → Notifications): Payments,
            Gallery activity and Orders join the toggles, and every toggle now governs both the
            alert email <em>and</em> what lands in your Snap inbox — one switch, one truth.
          </li>
          <li>
            Read the docs: <a href="/docs/inbox">Inbox</a>.
          </li>
        </ul>
      </Release>

      <Release version="0.2.0" date="September 30, 2026">
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
