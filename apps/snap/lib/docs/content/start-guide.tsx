/* Start Guide — the Linear-style onboarding doc: from empty account to a
 * delivered gallery, every claim tied to a real surface. */
import { H2, H3, Note, Shot, Steps, Related } from "@/lib/docs/primitives";

export default function StartGuide() {
  return (
    <>
      <p>
        If you&apos;re signing up fresh, this page walks the shortest path from an empty account to a
        client opening their gallery. Everything it names links straight to the screen that does it.
      </p>

      <Shot
        src="/docs-shots/start-guide/overview.png"
        alt="The Snap dashboard Overview page — studio stats, the setup guide checklist, and recent leads and projects."
        grad="dusk"
        wide
      />

      <H2>Overview and demo</H2>
      <p>
        Snap is your studio&apos;s back office. The dashboard sidebar has seven working areas:
      </p>
      <ul>
        <li>
          <strong>Overview</strong> — your studio at a glance: project pipeline stats, recent leads,
          and the setup guide checklist.
        </li>
        <li>
          <strong>Leads</strong> — the inbox where every inquiry lands, ready to triage and reply.
        </li>
        <li>
          <strong>Calendar</strong> — bookings, committed shoot days, and dated open leads, plus
          your availability rules.
        </li>
        <li>
          <strong>Projects</strong> — the kanban pipeline where every job lives from booking to
          delivery.
        </li>
        <li>
          <strong>Galleries</strong> — every client gallery link you&apos;ve sent, with its status
          and controls.
        </li>
        <li>
          <strong>RAW Vault</strong> — cold storage for RAW files (Lite and above, with a small
          trial pocket on Free).
        </li>
        <li>
          <strong>Transactions</strong> — every payment your studio has taken, with refunds and
          disputes.
        </li>
      </ul>
      <Note>
        Snap never shares data between studios — what you build, seed, and send is yours alone.
      </Note>

      <H2>Create your studio</H2>
      <Steps
        items={[
          <>
            <strong>Sign up</strong> with your email — the first screen asks for your studio name
            and timezone, and the email where new inquiries should land.
          </>,
          <>
            <strong>Pick a plan</strong> — Free to try the whole thing, Lite when you&apos;re
            growing, Studio for the working pro&apos;s tier, Pro for studios and teams. You can
            change anytime from <a href="/dashboard/settings/billing">Settings → Billing</a>; see{" "}
            <a href="/docs/billing-plans">Plans &amp; tiers</a> for exactly what each includes.
          </>,
          <>
            <strong>Land in the dashboard</strong> — the Overview page greets you with a{" "}
            <strong>setup guide</strong>: a ten-item checklist derived from what your studio has
            configured so far. It updates itself as you go, and it never nags about things you
            already did.
          </>,
        ]}
      />

      <H2>Work through the setup guide</H2>
      <p>
        The checklist follows the order real studios finish it in. Five steps matter most:
      </p>
      <Steps
        items={[
          <>
            <strong>Your brand</strong> — a logo and accent color that carry across every email,
            gallery, and invoice. In <a href="/dashboard/settings/brand">Settings → Brand</a>.
          </>,
          <>
            <strong>Connect payouts</strong> — a few minutes with Stripe Express, and money clients
            pay lands in your bank. Snap never holds it. In{" "}
            <a href="/dashboard/settings/payouts">Settings → Payouts</a>; see{" "}
            <a href="/docs/payouts">Payouts</a>.
          </>,
          <>
            <strong>Set your availability</strong> — weekly hours and blackout dates that decide
            what clients can book while you sleep. In{" "}
            <a href="/dashboard/calendar?tab=availability">Calendar → Availability</a>; see{" "}
            <a href="/docs/calendar">Calendar &amp; availability</a>.
          </>,
          <>
            <strong>Define a session type</strong> — length, price, and deposit for what you sell.
            In <a href="/dashboard/templates/session-types">Templates → Session types</a>.
          </>,
          <>
            <strong>Put Snap on your website</strong> — one script tag adds the contact form or
            booking calendar to any site. In <a href="/dashboard/settings/embeds">Settings → Embeds</a>;
            see <a href="/docs/embeds">Embeds</a>.
          </>,
        ]}
      />
      <p>
        The remaining steps — designing your contact form, getting a contract ready to send, and
        making it fully yours with a custom domain (paid plans) — are each one click from the
        checklist, deep-linked to the exact screen.
      </p>

      <H2>See it as your client</H2>
      <p>
        The last checklist item is an action, not a link: <strong>send yourself a demo gallery</strong>.
        Snap creates a real project with sample images, builds a real gallery, and emails it to
        your account&apos;s address — so you experience the exact journey your clients get: the
        verified link, the favorites, the slideshow, the download controls. It&apos;s the fastest
        way to understand what your studio just signed up for.
      </p>

      <H2>Getting the most out of Snap</H2>
      <H3>Part-timers</H3>
      <p>
        The <a href="/docs/booking-page">booking page</a> and inbox are the whole business at $0:
        inquiries arrive, you reply, clients book and pay deposits. Free includes 20 GB with the
        full client gallery feature set for five active galleries.
      </p>
      <H3>Working pros</H3>
      <p>
        Studio ($29/mo) is the tier most full-time photographers settle on: white-label galleries
        on your own domain, unlimited galleries and templates, RAW storage without the trial cap,
        and a 500 GB pool. See <a href="/docs/billing-plans">Plans &amp; tiers</a>.
      </p>
      <H3>Teams and studios with multiple brands</H3>
      <p>
        Link studios into one family (3 on Lite, unlimited on Studio and above) — storage and
        billing pool across all of them, and you switch studios from the sidebar. Team seats,
        roles, and member access are covered in <a href="/docs/billing-plans">Plans &amp; tiers</a>.
      </p>

      <Related slugs={["concepts", "billing-plans", "embeds", "calendar"]} />
    </>
  );
}
