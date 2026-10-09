/* Invoices & payments — what the code actually does: the invoice composer
 * and package presets, per-invoice design snapshots, the public /inv/{token}
 * client view, and the project payment ledger. Read from lib/invoices.ts,
 * lib/invoice-settings.ts, components/project-invoices.tsx, and
 * components/project-payments.tsx. */
import { H2, H3, Note, Steps, Tier, Related } from "@/lib/docs/primitives";

export default function Payments() {
  return (
    <>
      <p>
        Money on a project lives in its <strong>Payments &amp; invoices</strong> tab: invoices
        your client pays online, plus a ledger of everything collected — including cash and
        e-transfer you record by hand. Card payments run on Stripe, and the money lands in your
        account via <a href="/docs/payouts">Payouts</a>.
      </p>

      <H2>Creating an invoice</H2>
      <Steps
        items={[
          <>
            <strong>Compose</strong> — hit <strong>New invoice</strong>. One line item by default
            (description, amount, starting from the project&apos;s quoted total when one is set),
            or apply a <a href="/docs/template-library">package preset</a>{" "}
            <Tier plan="lite" /> to pull in a multi-line package like Wedding Collection.
          </>,
          <>
            <strong>Address it</strong> — the client&apos;s email and a due date; the composer
            defaults to 14 days out, and a due date in the past is refused.
          </>,
          <>
            <strong>Create the draft</strong> — nothing has been sent; the invoice sits numbered
            and editable on the project.
          </>,
          <>
            <strong>Send</strong> — Snap renders your branded PDF (archived to the project
            forever), mints a persistent Stripe payment link for the total, and emails the client
            a private link. The payment link charges directly on your connected Stripe account.
          </>,
        ]}
      />
      <Note>
        Everything about an invoice is counted in <strong>your Stripe account&apos;s
        currency</strong> — the one your connected account settles in, not a Snap default. Line
        items and the total show it in the composer, the client&apos;s checkout charges it, and
        merge fields like <code>{"{{invoice_total}}"}</code> and{" "}
        <code>{"{{deposit}}"}</code> format with it.
      </Note>
      <Note>
        After sending, an invoice is <strong>paid</strong> two ways: the client pays the link and
        Stripe&apos;s webhook flips it automatically, or you press{" "}
        <strong>Mark paid</strong> for money that arrived some other way. <strong>Void</strong>{" "}
        kills the invoice — and deactivates its payment link, so a stale link can never stay
        payable.
      </Note>

      <H2>Invoice design</H2>
      <p>
        <a href="/dashboard/settings/billing">Settings → Billing</a> holds the invoice design
        card: your <strong>numbering</strong> (a prefix, 3–6 digits of padding, optionally
        resetting each year — e.g. <code>INV-2026-0001</code>; numbers are sequential per studio,
        with gaps only where invoices were voided), a <strong>default tax</strong> label and rate
        (empty by default), <strong>default due days</strong>, <strong>terms</strong>, and{" "}
        <strong>notes</strong> — merge fields allowed in both. Every invoice{" "}
        <em>freezes this format at creation</em>: change your settings later and existing
        documents never change.
      </p>

      <H3>What the client sees</H3>
      <p>
        The emailed link opens a private invoice page — studio name, status badge, line items,
        tax line, total due, and your terms and notes — with a{" "}
        <strong>Pay — secure checkout</strong> button whenever the invoice carries its online
        payment link (an invoice sent before a Stripe account was connected goes out without
        one) and a PDF download. The link is a 256-bit token unique to that invoice: no login, unguessable, and
        you can resend it any time. Voided invoices vanish from their link entirely. The page and
        email follow your brand, dropping Snap&apos;s name entirely when white-labeled.
      </p>

      <H2>Recording money you collected yourself</H2>
      <p>
        Not every client pays online. <strong>Record payment</strong> adds a ledger entry for
        Cash, E-transfer, Cheque, Card (offline), or Other — it lands as succeeded, because the
        money is already yours. Mis-entered manual rows are voided: the row stays in the ledger
        tagged <code>[voided]</code> rather than being deleted.
      </p>
      <p>
        Set the project&apos;s <strong>quoted total</strong> and the tab earns a derived badge
        you can also see on the pipeline: <strong>unpaid</strong>, <strong>partial</strong>,{" "}
        <strong>paid</strong>, or <strong>overpaid</strong>, computed from succeeded payments
        against the quote. Booking deposits taken on your{" "}
        <a href="/docs/booking-page">booking page</a> land in the same ledger automatically.
      </p>

      <Related slugs={["transactions", "billing", "booking-page", "template-library"]} />
    </>
  );
}
