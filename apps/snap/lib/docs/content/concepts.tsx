/* Concepts — the Linear-style "core concepts" doc: leads → bookings →
 * projects → galleries/money, how the objects hand work to each other. */
import { H2, H3, Note, Shot, Tier, Related } from "@/lib/docs/primitives";

export default function Concepts() {
  return (
    <>
      <p>
        Snap is built around a few core objects that hand work to each other. Understanding how
        they connect makes every other page make sense — from a single inquiry to a delivered
        gallery with money in the bank.
      </p>

      <Shot
        src="/docs-shots/calendar/month.png"
        alt="The Snap calendar: a confirmed booking with its payment state, committed shoot days in green, and a dashed tentative lead — the core objects handing work to each other."
        grad="sea"
        wide
      />

      <H2>Basic concepts</H2>

      <H3>Leads</H3>
      <p>
        A lead is an inquiry before it&apos;s a job. Leads arrive on their own from your contact
        form, booking page, and embedded widgets — and you can add them by hand. They wait in the{" "}
        <a href="/dashboard/leads">Leads pipeline</a> with a status: <strong>new</strong>,{" "}
        <strong>replied</strong>, <strong>converted</strong>, or <strong>archived</strong>, while
        the conversation opens in your <a href="/docs/inbox">inbox</a>. You reply there (with your
        saved email snippets), and when the answer is yes, one click converts the lead into a
        project.
      </p>

      <H3>Bookings</H3>
      <p>
        A booking is a confirmed time slot: a session type, an event date, and usually a deposit.
        Clients book themselves through your <a href="/docs/booking-page">booking page</a> or an
        embedded calendar, choosing from the session types and availability you defined. A
        confirmed booking creates the client record and the project automatically — and if it came
        from a lead, that lead is marked converted without you touching anything.
      </p>

      <H3>Projects</H3>
      <p>
        The project is the job itself — everything about one client&apos;s work lives on it. The{" "}
        <a href="/dashboard/projects">pipeline</a> is a kanban board with six statuses:
        <strong> Booked</strong>, <strong>Snapping</strong>, <strong>Evaluation</strong>,{" "}
        <strong>Complete</strong>, <strong>Closed</strong>, and <strong>Canceled</strong>. Move a
        project freely between them (nothing is terminal, mistakes undo); the only automation is
        the nightly roll that moves booked projects to Snapping once their event date arrives.
      </p>

      <H3>The project hub</H3>
      <p>
        Open any project and it&apos;s all there in tabs: <strong>Overview</strong> (form responses
        and questionnaires), <strong>Files</strong> (the images, with folders and deduplication),{" "}
        <strong>Client gallery</strong> (design and send the gallery), <strong>Payments &amp;
        invoices</strong>, <strong>Contracts</strong>, and <strong>Activity</strong> (the full
        audit trail). See <a href="/docs/project-hub">The project hub</a>.
      </p>

      <H3>Galleries</H3>
      <p>
        A gallery is a share link you send to the client — designed covers and layouts, slideshows
        with your music, favorites and selections, downloads under your control. Every gallery is
        email-verified, expiring, and revocable; you see who viewed and what they loved. Galleries
        have five concurrently-active slots on Free, fifteen on Lite, and are unlimited on Studio
        and above. Start at <a href="/docs/gallery-delivery">Delivering galleries</a>.
      </p>

      <H3>Clients</H3>
      <p>
        A client is a person across all their work with your studio, keyed by email — convert two
        leads from the same address and they land on one client record. Clients see their side
        through a verified link too: the <a href="/docs/client-portal">client portal</a> and
        installable app gather every gallery you&apos;ve sent, where each project stands, and
        their upcoming bookings.
      </p>

      <H3>Money</H3>
      <p>
        Invoices and payments hang off the project: take deposits and balances, send invoices your
        client pays online, and watch every transaction — refunds, disputes, payouts — in one
        ledger. Money is processed by Stripe and lands in <em>your</em> bank via{" "}
        <a href="/docs/payouts">Payouts</a>; Snap never holds it.
      </p>

      <H3>Templates</H3>
      <p>
        The reusable definitions — contract agreements, forms and questionnaires, email snippets,
        invoice presets <Tier plan="lite" />, gallery styles <Tier plan="lite" />, and session
        types — live in one <a href="/docs/template-library">template library</a>. Applying a template
        copies it, so editing a template never rewrites what you already sent.
      </p>

      <H2>Plans and what they gate</H2>
      <p>
        Snap has four tiers: <strong>Free</strong>, <strong>Lite</strong> ($15/mo),{" "}
        <strong>Studio</strong> ($29/mo), and <strong>Pro</strong> ($59/mo). The shape of the
        ladder: Free is the full workflow with capped capacity (20 GB, 5 active galleries, 1 of
        each template); Lite adds RAW storage and headroom; Studio adds white-labeling, your own
        domain option, and unlimited templates; Pro adds a 2 TB pool, two custom domains, and ten
        team seats. Everything tier-gated in the docs carries a badge naming the minimum plan, and{" "}
        <a href="/docs/billing-plans">Plans &amp; tiers</a> has the exact table.
      </p>
      <Note>
        Reading the docs is never gated — badges describe the feature, not the documentation.
      </Note>

      <H2>How they fit together</H2>
      <p>
        One journey, end to end: an inquiry lands as a <em>lead</em>; your reply (or your booking
        page) turns it into a <em>booking</em>; the booking creates the <em>project</em> and the{" "}
        <em>client</em>; the project collects <em>files</em>, a <em>contract</em>, an{" "}
        <em>invoice</em>, and finally the <em>gallery</em> you send; the client&apos;s payment
        becomes a <em>transaction</em> and a payout. When the same person books again, their new
        project joins the same client — the relationship compounds.
      </p>

      <Related slugs={["start-guide", "leads", "projects", "billing-plans"]} />
    </>
  );
}
