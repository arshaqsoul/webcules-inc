/* Transactions & refunds — the studio-wide ledger. Statuses are the exact
 * set the webhook + repo write (lib/repos/payments.ts,
 * app/api/stripe/webhook/route.ts); the refund rules quote the real guards.
 * The table is a Linear-style status reference. */
import { H2, Note, Callout, Shot, Related } from "@/lib/docs/primitives";

export default function Transactions() {
  return (
    <>
      <p>
        <a href="/dashboard/transactions">Dashboard → Transactions</a> is the one ledger for
        every payment your studio has taken — booking deposits, invoice payments, and manual
        entries — with totals for collected and refunded across all of it. It&apos;s the
        audit trail of your money, owner-only.
      </p>

      <Shot
        src="/docs-shots/transactions/ledger.png"
        alt="The Transactions page: collected and refunded totals above a table of payments with date, project, type, amount, and status."
        grad="night"
        wide
      />

      <H2>Reading the ledger</H2>
      <p>
        Each row shows the <strong>date</strong>, the linked <strong>project</strong> (click
        through to it), the <strong>type</strong> — <code>booking</code>,{" "}
        <code>invoice</code>, or <code>manual</code> — the <strong>amount</strong>, and a{" "}
        <strong>status</strong>. Refund and void actions live on the project&apos;s Payments
        &amp; invoices tab, right next to the row.
      </p>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>What it means</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>succeeded</td>
            <td>Money collected. Card payments land here when Stripe&apos;s webhook confirms them; manual entries are recorded here.</td>
          </tr>
          <tr>
            <td>pending</td>
            <td>A payment started but not yet confirmed by Stripe&apos;s webhook — brief, and rare to catch.</td>
          </tr>
          <tr>
            <td>failed</td>
            <td>The card charge failed; no money moved.</td>
          </tr>
          <tr>
            <td>refunding</td>
            <td>You issued a refund and Stripe is processing it — the row confirms to refunded seconds later.</td>
          </tr>
          <tr>
            <td>refunded</td>
            <td>Fully refunded (Stripe refund completed, or a manual entry voided).</td>
          </tr>
          <tr>
            <td>disputed</td>
            <td>The client opened a chargeback with their bank. Refunds are frozen on this payment until Stripe resolves it.</td>
          </tr>
          <tr>
            <td>dispute_lost</td>
            <td>The dispute closed against you — the charge reverses and stays flagged.</td>
          </tr>
        </tbody>
      </table>
      <Note>
        A dispute you win restores the payment to succeeded automatically. Collected and
        refunded totals count only succeeded and refunded rows, so the headline numbers are
        always net reality.
      </Note>

      <H2>Refunds</H2>
      <p>
        Refunding a Stripe payment returns it <strong>in full</strong> to the client&apos;s card
        through Stripe — partial refunds aren&apos;t offered. Two guards decide whether the
        button works:
      </p>
      <ul>
        <li>
          <strong>Once work has begun, no refund</strong> — a project that has moved past Booked
          (Snapping, Evaluation, Complete, Closed) can&apos;t have its payments refunded. A
          refund is a pre-production remedy.
        </li>
        <li>
          <strong>Disputes freeze refunds</strong> — while a Stripe dispute is open, the money is
          with the banks.
        </li>
      </ul>
      <p>
        When a refund does go through, Snap asks one explicit question: <strong>delete the
        project&apos;s photos too?</strong> <em>Delete now</em> revokes live galleries and removes
        the uploaded files; <em>keep</em> leaves any gallery links working until they expire.
        Either way the refund is issued, the booking is canceled and the client emailed — and
        the project is canceled with it, unless it had already closed.
      </p>

      <H2>What a refund does to your money</H2>
      <p>
        The refund is processed by Stripe, and the returned amount settles against your Stripe
        balance — so it reduces what your next payouts carry rather than producing a separate
        bill. On the ledger the row flips to <strong>refunding</strong> immediately, then{" "}
        <strong>refunded</strong> once Stripe confirms, and the refunded total at the top of the
        page reflects it. See <a href="/docs/payouts">Payouts</a> for where the money sits.
      </p>

      <Related slugs={["payments", "payouts", "bookings"]} />
    </>
  );
}
