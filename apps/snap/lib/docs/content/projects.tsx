/* Projects & pipeline — the kanban doc. Every claim tied to code:
 * components/kanban-board.tsx (columns, accents, card contents),
 * lib/repos/projects.ts (free movement, the nightly booked→snapping
 * cron, the WEB-136 photos-delivered email on Complete). */
import { H2, Note, Callout, Shot, Related } from "@/lib/docs/primitives";

export default function Projects() {
  return (
    <>
      <p>
        Projects are the work. Every converted lead and every confirmed booking creates one
        automatically, and it lands as a card on the <a href="/dashboard/projects">projects
        board</a> — the pipeline your whole studio runs on.
      </p>

      <Shot
        src="/docs-shots/projects/pipeline.png"
        alt="The projects kanban board — six status lanes from Booked to Canceled, with draggable project cards."
        grad="moss"
        wide
      />

      <H2>The board</H2>
      <p>
        Six lanes, left to right, each with its own accent color and a live count. A card shows the
        project title (linked straight to the hub), the client&apos;s name or email, the event date,
        and — once you&apos;ve set a quote total — a payment badge: unpaid, partial, paid, or
        overpaid, derived from the money actually collected.
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
            <td><strong>Booked</strong></td>
            <td>Confirmed work with a date ahead of you. Every new project starts here.</td>
          </tr>
          <tr>
            <td><strong>Snapping</strong></td>
            <td>The event day has arrived — the shoot is on.</td>
          </tr>
          <tr>
            <td><strong>Evaluation</strong></td>
            <td>The shoot is behind you; culling and editing are under way.</td>
          </tr>
          <tr>
            <td><strong>Complete</strong></td>
            <td>Delivered. Moving here emails the client their photos-delivered note.</td>
          </tr>
          <tr>
            <td><strong>Closed</strong></td>
            <td>Fully wrapped — delivered and settled.</td>
          </tr>
          <tr>
            <td><strong>Canceled</strong></td>
            <td>The job died (a refund, a client cancellation). Kept for the record, not deleted.</td>
          </tr>
        </tbody>
      </table>

      <H2>Moving projects</H2>
      <p>
        Drag a card to any lane — the board updates immediately, confirms what changed in a quiet
        notice, and rolls back with an error if the move fails. The status badge in a project&apos;s
        header opens the same <strong>Move to</strong> menu with friendlier names: Snapping reads{" "}
        <strong>In editing</strong>, Evaluation reads <strong>In review</strong>, Complete reads{" "}
        <strong>Delivered</strong>. Same states, two surfaces.
      </p>

      <H2>The one automation</H2>
      <p>
        Nothing moves by itself except one thing: a nightly sweep advances every Booked project
        whose event date has arrived into Snapping, leaving the note{" "}
        <em>Automatic: event day reached</em> in the timeline. Projects without an event date sit
        still until you set one — the <strong>Add event date</strong> control in the project header
        re-arms the sweep. Everything else on the board moves because you moved it.
      </p>

      <H2>Nothing is terminal</H2>
      <p>
        Every move is free and reversible — including out of <strong>Closed</strong> and{" "}
        <strong>Canceled</strong>. A mis-drag costs nothing; a client who rebooks comes right back
        onto the board. Canceled is a normal status for dead jobs (refunding a booking cancels its
        project and lands it there), not a graveyard.
      </p>
      <Callout tone="info" title="Complete is the one status with consequences">
        Moving a project to Complete sends the client a photos-delivered email with a link to their{" "}
        <a href="/docs/client-portal">client portal</a>. It respects your notification settings, and
        if the email fails the move still happens — the pipeline never jams on a mailbox.
      </Callout>
      <Note>
        Committed shoots — Booked and Snapping projects with an event date — also appear on the{" "}
        <a href="/docs/calendar">calendar</a>, so the board and the schedule always agree.
      </Note>

      <Related slugs={["project-hub", "concepts", "bookings"]} />
    </>
  );
}
