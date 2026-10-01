/* Lead inbox — how inquiries become leads, where the conversation now lives
 * (the unified inbox), and how a yes becomes a project. Facts from
 * lib/repos/leads.ts, app/dashboard/leads/*, components/lead-conversation.tsx,
 * components/inbox/*, lib/repos/inbox.ts and lib/inbox/ingest.ts
 * (WEB-303..309 — the inbox epic). */
import { H2, Note, Callout, Shot, Tier, Related } from "@/lib/docs/primitives";

export default function Leads() {
  return (
    <>
      <p>
        An inquiry is a lead; a lead is a conversation. Every inquiry now opens a thread in your{" "}
        <a href="/docs/inbox">inbox</a> automatically, and the{" "}
        <a href="/dashboard/leads">Leads</a> page underneath tracks the pipeline: who is new, who
        has been answered, and who said yes.
      </p>

      <Shot
        src="/docs-shots/leads/inbox.png"
        alt="The Leads page: status tabs for All, New, Replied, Converted and Archived, an Import CSV button, a name-or-email search, Add lead, and a table of inquiries with shoot type, event date and status."
        grad="sea"
        wide
      />

      <H2>How leads arrive</H2>
      <ul>
        <li>
          <strong>Your contact form and widgets.</strong> The{" "}
          <a href="/dashboard/settings/embeds">embeddable contact form</a> and lead form on your
          website submit straight into the pipeline, carrying every answer — including file
          uploads — which show under <strong>Form answers</strong> on the lead. See{" "}
          <a href="/docs/embeds">Embeds</a>.
        </li>
        <li>
          <strong>By hand or by CSV.</strong> The <strong>Add lead</strong> button takes walk-ins
          and phone enquiries (name, email, phone, shoot type, event date, message);{" "}
          <strong>Import CSV</strong> brings a spreadsheet across in one pass, quietly — no inbox
          notification per row.
        </li>
        <li>
          <strong>Replies to your email.</strong> When a client answers a Snap email from their
          own inbox, the threading pipeline files it on the same conversation — however mangled
          the mail client left the headers. A cold email from someone brand new matches no
          conversation, so it waits under <strong>Needs triage</strong> instead of becoming a
          lead.
        </li>
      </ul>
      <p>
        Every new inquiry also drops an item into your inbox — <em>New inquiry</em> with the
        message as the preview — so the first touch never waits in a table.
      </p>
      <Note>
        A direct booking through your <a href="/docs/booking-page">booking page</a> doesn&apos;t
        create a lead — if that person already has an open lead, it&apos;s marked converted on its
        own so the same inquiry can&apos;t sit in two places at once.
      </Note>

      <H2>The leads pipeline</H2>
      <p>
        The <a href="/dashboard/leads">Leads page</a> is the deal list: status tabs —{" "}
        <strong>All</strong>, <strong>New</strong>, <strong>Replied</strong>,{" "}
        <strong>Converted</strong>, <strong>Archived</strong> — a name-or-email search, and a
        table showing the shoot, event date, status and when the inquiry arrived, newest activity
        first. Two statuses move without you: a sent reply marks a lead{" "}
        <strong>replied</strong>, and conversion marks it <strong>converted</strong>. Use{" "}
        <strong>Archive</strong> to shelve the time-wasters (<strong>Restore</strong> undoes it) —
        archived leads never block a fresh inquiry from the same person later. Open leads that
        carry an event date also appear on your <a href="/docs/calendar">calendar</a> as tentative
        days.
      </p>

      <H2>Threads live in the inbox</H2>
      <p>
        Each client has one conversation, and a lead&apos;s history lives inside it. Open a lead
        and you get the record — contact details, form answers, the project once it exists — plus
        a conversation card whose <strong>Open in Inbox</strong> button jumps straight to the
        thread. Reading and replying happen there, in exactly one composer; the lead page keeps
        none of its own.
      </p>
      <p>
        In the reading pane, client emails render inside a locked sandbox — scripts dead by
        policy, remote images click-to-load, quoted history collapsed behind a toggle — and your
        studio&apos;s own events (bookings, contracts, payments, gallery activity) interleave as
        compact cards with deep links. The thread header links the lead and the project, and an
        email that arrived unmatched can be attached to the right client, lead or project from{" "}
        <strong>Needs triage</strong> in one click.
      </p>

      <H2>Replying &amp; the composer</H2>
      <p>
        Replies send from the conversation&apos;s own address on snap.webcules.com — your
        studio&apos;s display name up front, your contact address as Reply-To — so the client just
        hits reply and lands back on the same thread. <strong>Insert a saved reply…</strong>{" "}
        drops in one of your email snippets from{" "}
        <a href="/dashboard/templates/emails">Templates → Emails</a> (
        <a href="/docs/templates">Templates guide</a>) with merge fields like the client&apos;s
        name resolved for the person you&apos;re writing to; <strong>+ Gallery link</strong>{" "}
        inserts their gallery link (replies carry links, not attachments), and your business
        signature appends itself. A reply that fails to deliver keeps your draft on the thread
        with a <strong>Retry send</strong> — and while the Snap inbox is young,{" "}
        <strong>Send a copy</strong> to your own inbox is on by default (Settings → Notifications
        → Reply mirroring).
      </p>

      <H2>Convert the yeses</H2>
      <p>
        When the answer is yes, click <strong>Convert to project</strong> on the lead. The dialog
        prefills <strong>Project title</strong>, <strong>Event date</strong>,{" "}
        <strong>Client email</strong>, and <strong>Client name</strong> from the inquiry — fix
        anything the lead got wrong and the lead is updated to match — then{" "}
        <strong>Create project</strong> makes it real: a project lands in <strong>Booked</strong>{" "}
        on your <a href="/dashboard/projects">pipeline</a>, the person is added to (or merged
        into) your clients, and the lead is marked converted with a link to its project.
      </p>
      <Callout tone="info" title="No event date? Say so deliberately.">
        Converting without an event date creates the project, but it won&apos;t auto-advance
        through the pipeline until a date is set — the dialog warns you, and you can add the date
        on the project later.
      </Callout>

      <H2>One open thread per email</H2>
      <p>
        Two open leads sharing an email would tangle reply threads and client records, so Snap
        blocks that state outright: manual entry, an email edit on a lead, and conversion all
        check for another open lead at the same address and refuse to fork it. Closed business
        doesn&apos;t count — a <strong>converted</strong> or <strong>archived</strong> lead never
        blocks a brand-new inquiry from the same person.
      </p>

      <H2>Snooze, filters &amp; the keymap</H2>
      <p>
        The inbox&apos;s speed layer works on inquiries like everything else: tabs —{" "}
        <strong>All</strong>, <strong>Unread</strong>, <strong>Needs reply</strong> (the client
        spoke last), <strong>Needs triage</strong> — an unread badge mirrored into the browser
        tab title, search over titles and previews, a kind filter (press <strong>F</strong>), and
        a list/thread split that drags to taste and is remembered. The keymap is Linear&apos;s:{" "}
        <strong>j/k</strong> move, <strong>Enter</strong> opens, <strong>U</strong> toggles read,{" "}
        <strong>Backspace</strong> deletes, <strong>⌘K</strong> opens the command menu,{" "}
        <strong>?</strong> shows the sheet. <strong>Snooze</strong> parks a conversation until
        later today, tomorrow, next week, or a moment you pick — it resurfaces unread{" "}
        <Tier plan="lite" />. The full tour lives on the <a href="/docs/inbox">Inbox</a> page.
      </p>

      <Related slugs={["inbox", "booking-page", "projects", "templates", "embeds"]} />
    </>
  );
}
