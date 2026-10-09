/* Booking page — the standalone public booking link at /b/{slug}: what
 * clients see, where the link lives (Settings → Embeds), the Lite-gated
 * page designer, and how session types drive the page. */
import { Callout, H2, Note, Related, Shot, Steps, Tier } from "@/lib/docs/primitives";

export default function BookingPage() {
  return (
    <>
      <p>
        Your booking page is a standalone link — <code>/b/your-studio</code> — that works with no
        website at all. Put it in your Instagram bio, your email signature, anywhere a client might
        look. They open it, pick a session and a time, pay the deposit, and the booking lands in
        your calendar with the client and project created for you.
      </p>

      <Shot
        src="/docs-shots/booking-page/public.png"
        alt="The public booking page: the studio's logo and welcome line above the embedded booking calendar."
        grad="dusk"
      />

      <H2>One link, no website needed</H2>
      <p>
        The link lives in <a href="/dashboard/settings/embeds">Settings → Embeds</a> under{" "}
        <strong>Public booking link</strong>, with copy and open buttons right next to it. The page
        carries your logo, accent, and font automatically — theming follows your studio brand set
        in <a href="/dashboard/settings/brand">Settings → Brand</a>. Search engines are told to
        skip it: anyone with the link books freely, but the page itself is not indexed.
      </p>

      <H2>What clients see</H2>
      <Steps
        items={[
          <>
            <strong>Choose your session</strong> — with two or more session types the page opens on
            a picker showing each type's duration and price. Exactly one type applies silently; none
            shows a plain calendar.
          </>,
          <>
            <strong>Pick a time</strong> — the same open slots your calendar holds: weekly hours
            minus blackout dates minus existing bookings, with your lead time and booking horizon
            applied. Times show in your studio's timezone.
          </>,
          <>
            <strong>Leave their details</strong> — name, email, phone, and any questions you
            attached to the session type. A Cloudflare Turnstile check runs in the background.
          </>,
          <>
            <strong>Pay, if you ask them to</strong> — when a deposit or full payment is required
            (on the session type or your booking settings), the whole page follows Stripe
            Checkout — hosted by Stripe, and back to your page when it&apos;s done — while the
            slot is held.
          </>,
          <>
            <strong>Get confirmed</strong> — a branded confirmation email with a calendar invite
            attached and a <em>Manage your booking</em> link. See{" "}
            <a href="/docs/bookings">Managing bookings</a>.
          </>,
        ]}
      />
      <p>
        Money follows your Stripe account, not a Snap default: prices on the page show in your
        account&apos;s currency, and paid bookings are charged on it directly (see{" "}
        <a href="/docs/payouts">Payouts</a>). Paid bookings need that connection to be active —
        if it isn&apos;t, the calendar doesn&apos;t take bookings it can&apos;t charge for.
        Clients who try to pay see a plain note that the studio can&apos;t take online payments
        right now and to get in touch directly, with your contact email in the footer just
        below.
      </p>
      <p>
        The page embeds exactly the same calendar as the{" "}
        <a href="/docs/embeds">website embed</a> — identical availability engine, bot protection,
        and double-book guard — so the calendar behaves the same wherever a client meets it.
        Below the calendar sit your intro, an FAQ under the heading <strong>Good to know</strong>,
        your social links, and a secure-booking footer with your contact email. On{" "}
        <a href="/docs/brand">Studio and above</a> the footer's "via Snap" steps aside.
      </p>

      <H2>
        Make it yours <Tier plan="lite" />
      </H2>
      <p>
        The <strong>Booking page</strong> card in{" "}
        <a href="/dashboard/settings/embeds">Settings → Embeds</a> is a designer for every word on
        the page, with your real page as a live preview beside the fields:
      </p>
      <ul>
        <li>
          <strong>Hero</strong> — a title (shown when no logo is set) and a subtitle; empty fields
          keep the defaults, like "Pick a time that works for you — booking takes under a minute."
        </li>
        <li>
          <strong>Intro</strong> — an optional heading and a couple of lines about your process,
          rendered in a card under the calendar.
        </li>
        <li>
          <strong>FAQ</strong> — up to eight question-and-answer pairs, shown as collapsibles that
          work without JavaScript.
        </li>
        <li>
          <strong>Social links</strong> — up to five pills: Instagram, Facebook, TikTok, website
          (https links only), or email.
        </li>
        <li>
          <strong>Thank-you</strong> — the title and body on the confirmation screen clients land
          on after paying.
        </li>
      </ul>
      <Callout tone="info" title="Design is a Lite feature">
        The booking page itself works on every plan. Writing your own hero, intro, FAQ, socials,
        and thank-you copy is included with Lite and above — on Free the card shows the upgrade
        path instead of the fields.
      </Callout>
      <Note>
        Nothing is drafted at you: fields stay empty until you write them, and saving flips the
        live page immediately.
      </Note>

      <H2>Session types drive the page</H2>
      <p>
        Everything clients choose from comes from your session types, managed under{" "}
        <a href="/dashboard/templates/session-types">Templates → Session types</a>: duration,
        price, deposit, and the booking questions each type asks. You can deep-link straight into
        one type with <code>/b/your-studio?type=family-portrait</code> — useful when one link
        should sell exactly one thing. Free includes one session type, Lite three, Studio and
        above unlimited; see <a href="/docs/billing-plans">Plans &amp; tiers</a>.
      </p>

      <Related slugs={["calendar", "bookings", "embeds", "template-library"]} />
    </>
  );
}
