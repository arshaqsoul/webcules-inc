/* Payouts — Stripe Express onboarding and where client money goes. Read from
 * components/payouts-panel.tsx, lib/connect.ts, and the booking/invoice
 * charge paths (destination charges, application_fee_amount 0). Fee and
 * timing claims stay within what the code and panel actually show. */
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
        alt="Settings → Payouts: a connected Stripe Express account showing available and pending balance, the last payout, and the payout schedule."
        grad="sea"
      />

      <H2>Connecting with Stripe Express</H2>
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
            <td>No Stripe account yet — the Connect payouts button starts onboarding.</td>
          </tr>
          <tr>
            <td>Setup in progress</td>
            <td>The account exists but onboarding isn&apos;t finished — Resume onboarding continues where you left off.</td>
          </tr>
          <tr>
            <td>Connected</td>
            <td>Payments can land. The panel gains your live balance and payout schedule.</td>
          </tr>
          <tr>
            <td>Needs attention</td>
            <td>Stripe needs updated information before payments continue — Update with Stripe reopens onboarding.</td>
          </tr>
        </tbody>
      </table>
      <Note>
        Once connected, the <strong>Stripe dashboard</strong> button opens your Express dashboard
        — payout history, bank settings, and tax documents live there.
      </Note>

      <H2>Where the money goes</H2>
      <p>
        Clients pay your Stripe account directly — booking deposits and invoice payment links
        are routed to it the moment you&apos;re connected. Snap&apos;s cut is <strong>$0</strong>:
        there is no platform fee on client payments; the subscription is how Snap earns. Once
        connected, the panel shows your Stripe balance as it is — <strong>Available</strong>,{" "}
        <strong>Pending</strong>, and your <strong>last payout</strong> — refreshed from Stripe
        on every view.
      </p>

      <H2>Fees</H2>
      <p>
        Snap takes nothing from a booking. Stripe&apos;s standard processing fees still apply to
        card payments — they&apos;re visible per transaction in your Stripe Express dashboard.
        Check Stripe&apos;s pricing for current rates; Snap doesn&apos;t add anything on top.
      </p>

      <H2>Timing</H2>
      <p>
        Payouts follow the schedule Stripe sets on your account, shown verbatim in the panel —
        the interval and any delay in days (for example, a daily interval with a 2-day delay).
        The schedule itself is managed in your Stripe Express dashboard; payments sitting in
        <em> Pending</em> balance are in that window.
      </p>

      <Callout tone="info" title="Needs attention is fixable, not fatal">
        If Stripe flags your account — expired verification, a bank change — payments pause
        until the information is updated. The panel names what Stripe is waiting on and links
        you straight to the fix.
      </Callout>

      <Related slugs={["payments", "transactions", "billing-plans"]} />
    </>
  );
}
