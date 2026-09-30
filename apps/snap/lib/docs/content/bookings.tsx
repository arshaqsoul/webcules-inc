/* Managing bookings — statuses and what they mean, what a confirmed booking
 * creates, reminders (+ ICS attachments), the client manage page, and the
 * reschedule/cancel rules with their cutoffs. Authored from the WEB-272/273
 * booking-manage and reminder code. */
import { Callout, H2, Note, Related } from "@/lib/docs/primitives";

export default function Bookings() {
  return (
    <>
      <p>
        A booking is a held slot with a life of its own: it confirms (or waits for payment),
        reminds the client, survives a reschedule, and cancels cleanly. This page is what happens
        after the calendar fills.
      </p>

      <H2>Booking statuses</H2>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Pending</strong>
            </td>
            <td>
              The slot is held but payment hasn't confirmed yet — this only happens when you
              require a deposit or full payment. The moment Stripe's webhook confirms the payment,
              the booking flips to confirmed and the client record and project are created. A
              payment that never arrives releases the hold: the daily sweep cancels unpaid pending
              bookings about a day after they were made.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Confirmed</strong>
            </td>
            <td>
              A live booking. It counts against your availability, gets reminders, and can be
              rescheduled or canceled.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Canceled</strong>
            </td>
            <td>
              Over either way. The slot is open again immediately, the row stays for the record,
              and the calendar day shows a struck-through count instead of a pill. A canceled
              booking can't be rescheduled.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        The calendar's day panel also shows the payment state on each booking:{" "}
        <strong>unpaid</strong>, <strong>deposit</strong>, or <strong>paid</strong>.
      </p>

      <H2>What a confirmed booking creates</H2>
      <ul>
        <li>
          A <strong>client record</strong>, keyed by email — when the same person books again, the
          new work joins their existing client.
        </li>
        <li>
          A <strong>project</strong> in Booked with the session as its event date, ready on the{" "}
          <a href="/docs/projects">pipeline</a> (it advances to Snapping on the day automatically).
        </li>
        <li>
          An open <strong>lead</strong> with the same email is marked converted, so your inbox
          never shows the same person twice.
        </li>
      </ul>
      <p>
        You get an email for every booking, and the <a href="/docs/calendar">calendar</a> picks it
        up on its next refresh — no manual syncing anywhere.
      </p>

      <H2>Reminders</H2>
      <p>
        Reminders are on by default: one email 24 hours before each session, sent by the daily
        pass. Pick a preset in <a href="/dashboard/calendar?tab=availability">Calendar →
        Availability → Reminders</a> — 24 hours, 24 + 1, 48, 12, 4, or 72 hours before — and
        optionally add yourself as a recipient. The rules the engine enforces:
      </p>
      <ul>
        <li>Each reminder sends exactly once, even if the daily run overlaps itself.</li>
        <li>Nothing is ever sent after the session has started.</li>
        <li>
          Because reminders ride the daily 6:00 UTC pass, one may land a few hours early when the
          timing straddles the run.
        </li>
        <li>
          The client email is branded in your accent and carries the calendar invite (.ics) as a
          real attachment.
        </li>
      </ul>
      <Note>
        Every client booking email carries the invite: the confirmation (paid and free bookings
        alike), the reschedule notice as an update of the same event, and each reminder. Edit the
        copy under <a href="/dashboard/templates/emails">Templates → Emails</a>.
      </Note>

      <H2>The client's manage page</H2>
      <p>
        Every confirmation email includes a <em>Manage your booking</em> link — a private,
        studio-branded page showing the session type, the time, and the payment state. From it a
        client can reschedule by picking a new slot from the same calendar your booking page uses
        (their own slot never blocks its neighbors), or cancel. Inside your cutoff windows the
        page points them at your contact email instead.
      </p>
      <p>
        You control the link from the calendar's day panel: turn it off — it stops working
        immediately — or issue a fresh one, which kills the old link and copies the new to your
        clipboard. A dead link shows a calm branded page telling the client to contact you, never
        an error.
      </p>

      <H2>Reschedules and cancellations</H2>
      <p>
        A reschedule moves the booking in place: same booking, a "moved from" note on the
        calendar, the linked project's event date follows, and any payment carries over — a paid
        deposit is never re-charged. Client and studio are emailed with the updated invite. A
        cancellation frees the slot instantly, emails client and studio, and deliberately leaves
        the linked project untouched — what happens to it is your call on the pipeline.
      </p>
      <Callout tone="warn" title="Cutoffs and refunds">
        By default clients can reschedule until 24 hours before and cancel until 48 hours before;
        both are yours to change (0 means until start time) under Calendar → Availability →{" "}
        <strong>Client changes</strong>, where a refund-policy note for prepaid cancellations
        lives too. Refunds themselves stay in your hands — issue them from Stripe. You are never
        cutoff-gated: reschedule or cancel any booking from the calendar day panel at any time.
      </Callout>

      <Related slugs={["calendar", "booking-page", "client-portal", "payments"]} />
    </>
  );
}
