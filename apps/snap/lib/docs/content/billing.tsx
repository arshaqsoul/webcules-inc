/* Subscription & billing — how plan changes, proration, the custom-domain
 * add-on, and storage overage actually behave. Read from lib/billing.ts and
 * components/plan-panel.tsx; the dialog copy is quoted verbatim. */
import { H2, H3, Note, Callout, Steps, Tier, Related } from "@/lib/docs/primitives";

export default function Billing() {
  return (
    <>
      <p>
        Your Snap subscription is billed monthly through Stripe in USD. Everything on this page
        happens in <a href="/dashboard/settings/billing">Settings → Billing</a>: the tier grid,
        live usage against your caps, and the plan cards. A <strong>Manage billing</strong>{" "}
        button opens Stripe&apos;s customer portal for card changes and invoice history.
      </p>

      <H2>Changing plans</H2>
      <Steps
        items={[
          <>
            <strong>Upgrading</strong> switches you immediately. Snap shows the exact prorated
            amount before you confirm — &quot;Charged now: $X (prorated for the rest of this
            cycle)&quot; — charges it to your card, and your next invoice is the new plan&apos;s
            full price. If the card declines, the upgrade doesn&apos;t apply; you stay on your
            current plan.
          </>,
          <>
            <strong>Downgrading</strong> takes effect at your next billing cycle. Nothing is
            charged now, the current plan keeps working until the period ends, and the panel
            shows it as pending — &quot;nothing is charged until then.&quot;
          </>,
          <>
            <strong>Stepping back down in the same cycle</strong> — if you upgraded during this
            billing period, a dialog offers an instant prorated switch-back: the unused
            difference is credited on your next invoice, so you only pay for the days you were
            actually on the higher tier.
          </>,
          <>
            <strong>Cancelling</strong> (downgrade to Free) ends the subscription at period end.
            Your files are never deleted — caps tighten, that&apos;s all.
          </>,
        ]}
      />
      <Callout tone="info" title="No cash refunds — credits, not reversals">
        Proration works through Stripe&apos;s invoice ledger: upgrade differences are charged now,
        switch-back credits land on the next invoice. Nothing is ever refunded to your card;
        credits roll forward.
      </Callout>

      <H2>Failed payments and grace</H2>
      <p>
        A declined renewal doesn&apos;t drop you instantly — your plan keeps running through a{" "}
        <strong>14-day grace period</strong> while Stripe retries. The panel shows the past-due
        state; settle the card in the billing portal and nothing changes.
      </p>

      <H2>
        The custom-domain add-on <Tier plan="studio" />
      </H2>
      <p>
        Studio includes zero domain slots by itself; the add-on adds one for{" "}
        <strong>$5/mo</strong> — galleries, booking page, and client portal on your own hostname.
        It is a second line item on your existing subscription (never a separate bill), added
        with a prorated charge from today. Cancelling it keeps the domain live until the end of
        the paid period, then the bill drops by $5/mo; your domain settings are preserved. Pro
        needs none of this — two domains are included. See{" "}
        <a href="/docs/domains">Custom domains</a>.
      </p>

      <H2>Storage overage, in real numbers</H2>
      <p>
        <Tier plan="studio" /> storage past your cap bills at $0.10 per GB per month, capped at
        the next tier&apos;s price difference. The billing panel tracks it live: the storage bar
        turns amber at 90%, and the overage zone shows the exact rate. Worked example on Studio —
        500 GB included, 620 GB used: 120 GB over × $0.10 = <strong>$12/mo</strong> on top of
        your $29. The charge can never exceed $30 (the Studio→Pro delta), because at that point
        Pro&apos;s 2 TB is the better buy.
      </p>
      <Callout tone="warn" title="The hard lock is honest about being a lock">
        At 2× your plan&apos;s storage (1 TB on Studio), uploads are refused outright — galleries
        and downloads keep working, nothing is deleted. On Free and Lite there is no overage
        billing at all: the zone between cap and lock is warning space, and the lock still stops
        uploads at 2×. The full math lives in <a href="/docs/storage">Storage &amp; limits</a>.
      </Callout>

      <Note>
        One subscription covers the whole studio family — every linked studio pools storage and
        rides the parent&apos;s bill. Family children see the plan read-only, pointing at the
        parent&apos;s Billing page.
      </Note>

      <H2>Invoice design settings</H2>
      <p>
        Settings → Billing is also where the <strong>Invoice design</strong> card lives: your
        invoice numbering format, default tax, due days, terms, and notes for the invoices you
        send clients. Those settings are snapshotted per invoice at creation — changing them
        never rewrites documents already sent. That side of the house is covered in{" "}
        <a href="/docs/payments">Invoices &amp; payments</a>.
      </p>

      <Related slugs={["billing-plans", "payments", "storage", "domains"]} />
    </>
  );
}
