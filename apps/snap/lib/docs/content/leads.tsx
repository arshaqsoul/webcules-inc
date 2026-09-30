/* Lead inbox — how inquiries arrive, triage, replying with snippets,
 * statuses, conversion, and the one-open-thread-per-email rule. Facts from
 * lib/repos/leads.ts, app/dashboard/leads/*, components/lead-*.tsx,
 * app/api/leads/[id]/reply and app/api/email/inbound (WEB-122/167/253). */
import { H2, Note, Callout, Shot, Related } from "@/lib/docs/primitives";

export default function Leads() {
  return (
    <>
      <p>
        Every inquiry lands in one inbox, whether it came from your website or your own hand.
        This page walks the whole life of a lead: arrival, the reply, and the click that turns a
        maybe into a booking.
      </p>

      <Shot
        src="/docs-shots/leads/inbox.png"
        alt="The Snap lead inbox: status tabs for All, New, Replied, Converted and Archived, a name and email search, and a table of inquiries with shoot type, event date and status."
        grad="sea"
        wide
      />

      <H2>How leads arrive</H2>
      <ul>
        <li>
          <strong>Your contact form and widgets.</strong> The{" "}
          <a href="/dashboard/settings/embeds">embeddable contact form</a> and lead form on your
          website submit straight into the inbox, carrying every answer — including file uploads —
          which show under <strong>Form answers</strong> on the lead. See{" "}
          <a href="/docs/embeds">Embeds</a>.
        </li>
        <li>
          <strong>By hand.</strong> The <strong>Add lead</strong> button takes walk-ins and phone
          enquiries: name, email, phone, shoot type, event date, message.
        </li>
        <li>
          <strong>Replies to your email.</strong> When a client answers a Snap email from their
          own inbox, their message threads into the conversation automatically.
        </li>
      </ul>
      <Note>
        A direct booking through your <a href="/docs/booking-page">booking page</a> doesn't create
        a lead — if that person already has an open lead, it's marked converted on its own so the
        same inquiry can't sit in two places at once.
      </Note>

      <H2>Triage the inbox</H2>
      <p>
        The <a href="/dashboard/leads">inbox</a> tabs — <strong>All</strong>, <strong>New</strong>,{" "}
        <strong>Replied</strong>, <strong>Converted</strong>, <strong>Archived</strong> — plus a
        name-or-email search sort the queue. Rows show the shoot, event date, status, and when the
        inquiry arrived, newest activity first. Two statuses move without you: a sent reply marks a
        lead <strong>replied</strong>, and conversion marks it <strong>converted</strong>. Use{" "}
        <strong>Archive</strong> to shelve the time-wasters (<strong>Restore</strong> undoes it)
        — archived leads never block a fresh inquiry from the same person later. Open leads that
        carry an event date also appear on your{" "}
        <a href="/docs/calendar">calendar</a> as tentative days.
      </p>

      <H2>Replying</H2>
      <p>
        Open a lead and the whole thread is there: the original inquiry, your replies, and the
        client's answers in one conversation. The composer has an <strong>Insert a saved
        reply…</strong> dropdown — your email snippets from{" "}
        <a href="/dashboard/templates/emails">Templates → Emails</a> (
        <a href="/docs/templates">Templates guide</a>), with merge fields like the client's name
        filled in for the person you're writing to. <strong>Send reply</strong> emails it from
        your studio's name; the client just hits reply, and their answer lands back in the thread
        — Snap strips the quoted history Gmail and Outlook wrap around it, and pings your contact
        address with an excerpt so nothing is missed.
      </p>

      <H2>Convert the yeses</H2>
      <p>
        When the answer is yes, click <strong>Convert to project</strong>. The dialog prefills{" "}
        <strong>Project title</strong>, <strong>Event date</strong>, <strong>Client email</strong>,{" "}
        and <strong>Client name</strong> from the inquiry — fix anything the lead got wrong, and{" "}
        <strong>Create project</strong> makes it real: a project lands in <strong>Booked</strong>{" "}
        on your <a href="/dashboard/projects">pipeline</a>, the person is added to (or merged into)
        your clients, and the lead is marked converted with a link to its project.
      </p>
      <Callout tone="info" title="No event date? Say so deliberately.">
        Converting without an event date creates the project, but it won't auto-advance through
        the pipeline until a date is set — the dialog warns you, and you can add the date on the
        project later.
      </Callout>

      <H2>One open thread per email</H2>
      <p>
        Two open leads sharing an email would tangle reply threads and client records, so Snap
        blocks that state outright: manual entry, an email edit on a lead, and conversion all
        check for another open lead at the same address and refuse to fork it. Closed business
        doesn't count — a <strong>converted</strong> or <strong>archived</strong> lead never
        blocks a brand-new inquiry from the same person.
      </p>

      <Related slugs={["booking-page", "projects", "templates", "embeds"]} />
    </>
  );
}
