/* Payouts - connecting your own Stripe account (hosted onboarding or OAuth for an
 * existing account) and where client money goes. Read from
 * components/payouts-panel.tsx, lib/connect.ts, and the booking/invoice
 * charge paths (direct charges on the studio account, no application fee, WEB-352).
 * State semantics: charges_enabled with only Stripe-side verification pending is
 * still "active" - "restricted" is reserved for requirements Stripe waits on YOU for.
 * Fee and timing claims stay within what the code and panel actually show. */
import { H2, Note, Callout, Shot, Related } from "@/lib/docs/primitives";

export default function Payouts() {
  return (
    <>
      <p>
        Connect your bank once via <a href="/dashboard/settings/payouts">Settings → Payouts</a>,
        and money clients pay — booking deposits, invoice checkouts — flows straight to your
        bank through Stripe. <strong>Snap never holds it.</strong> Snap&apos;s servers keep only
        your Stripe account id; identity and bank details live in Stripe, never here.
      </p>

      <Shot
        src="/docs-shots/payouts/panel.png"
        alt="Settings → Payouts: a connected Stripe account showing available and pending balance, the last payout, and the payout schedule."
        grad="sea"
      />

      <H2>Already have a Stripe account?</H2>
      <p>
        If your studio already uses Stripe, choose <strong>I already have a Stripe account</strong> next to
        Connect payouts. You sign in to Stripe, approve Snap, and payments go to that account with
        no new account to create. Stripe&apos;s fees come out of your own account, exactly as with a
        new one. To disconnect later, revoke Snap in your Stripe dashboard — Snap stops
        charging on it and the panel returns to Not connected. (The option only appears once
        Snap has switched it on for the platform.)
      </p>

      <H2>Connecting your Stripe account</H2>
      <p>
        Press <strong>Connect payouts</strong> and Stripe hosts the whole onboarding — identity
        verification and bank details happen on Stripe&apos;s pages, usually a few minutes. You
        land back in Snap when it&apos;s done. The panel shows one of four states:
      </p>
      <table>
        <thead>
          <tr>
            <th>State</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Not connected</td>
            <td>No Stripe account connected yet — <strong>Connect payouts</strong> creates one with Stripe-hosted onboarding, or <strong>I already have a Stripe account</strong> links an existing one.</td>
          </tr>
          <tr>
            <td>Setup in progress</td>
            <td>The account exists but onboarding — or Stripe&apos;s review of it — isn&apos;t finished. Resume onboarding continues where you left off.</td>
          </tr>
          <tr>
            <td>Connected</td>
            <td>Stripe accepts charges on your account — payments can land. Even while Stripe is still finishing identity verification or payout setup in the background, you stay Connected. The panel gains your live balance and payout schedule.</td>
          </tr>
          <tr>
            <td>Needs attention</td>
            <td>Stripe is waiting on <em>you</em> — past-due requirements or a disabled account. Update with Stripe reopens onboarding, and the panel names the items it needs.</td>
          </tr>
        </tbody>
      </table>
      <Note>
        Once connected, the <strong>Stripe dashboard</strong> button opens your Stripe dashboard
        — payout history, bank settings, and tax documents live there.
      </Note>

      <H2>Where the money goes</H2>
      <p>
        Clients pay your Stripe account directly — booking deposits and invoice payment links
        are charged on it the moment you&apos;re connected, in your account&apos;s own currency.
        Snap&apos;s cut is <strong>$0</strong>:
        there is no platform fee on client payments; the subscription is how Snap earns. Once
        connected, the panel shows your Stripe balance as it is — <strong>Available</strong>,{" "}
        <strong>Pending</strong>, and your <strong>last payout</strong> — refreshed from Stripe
        on every view.
      </p>

      <H2>Fees</H2>
      <p>
        Snap takes nothing from a booking, and no payment ever passes through Snap&apos;s Stripe
        account: clients pay you directly. Stripe&apos;s standard processing fees apply to card
        payments and are charged to your own Stripe account - they&apos;re visible per transaction
        in your Stripe dashboard.
        Check Stripe&apos;s pricing for current rates; Snap doesn&apos;t add anything on top.
      </p>

      <H2>Timing</H2>
      <p>
        Payouts follow the schedule Stripe sets on your account, shown verbatim in the panel —
        the interval and any delay in days (for example, a daily interval with a 2-day delay).
        The schedule itself is managed in your Stripe dashboard; payments sitting in
        <em> Pending</em> balance are in that window.
      </p>

      <Callout tone="info" title="Needs attention is fixable, not fatal">
        A Stripe review that needs nothing from you never interrupts anything — identity
        verification in flight keeps you Connected and taking payments. Needs attention appears
        only when Stripe is waiting on you: an expired document, a bank change. Payments pause
        until the information is updated, and the panel names what Stripe is waiting on and links
        you straight to the fix.
      </Callout>

      <Related slugs={["payments", "transactions", "billing-plans"]} />
    </>
  );
}
