/* The project hub — one doc page per tab, written from code:
 * app/dashboard/projects/[id]/page.tsx (exact tab order), project-files.tsx
 * (folders, dedup, culling), project-payments/invoices/contracts.tsx, and
 * the ActivityTab feed (status events + share activity + audit log). */
import { H2, H3, Note, Callout, Shot, Related } from "@/lib/docs/primitives";

export default function ProjectHub() {
  return (
    <>
      <p>
        Open any project and everything about that job is in one place: the details, the files, the
        gallery, the money, the contracts, and the full history — six tabs, each loading only its
        own data so the hub stays fast on jobs with thousands of files.
      </p>

      <Shot
        src="/docs-shots/project-hub/overview.png"
        alt="The project hub's Overview tab — details, private notes, the status timeline, and questionnaires."
        grad="sea"
        wide
      />

      <H2>The header</H2>
      <p>
        The title carries the status dot; beside it sit the client&apos;s name, email, and event
        date. The status badge opens the <strong>Move to</strong> menu, and if the project has no
        event date yet, an <strong>Add event date</strong> control appears — undated projects never
        auto-advance. Tabs are real URLs (<code>?tab=files</code>), so any view is bookmarkable and
        shareable with a teammate.
      </p>

      <H2>The tabs</H2>
      <p>
        In order: <strong>Overview</strong>, <strong>Files</strong>, <strong>Client gallery</strong>,{" "}
        <strong>Payments &amp; invoices</strong>, <strong>Contracts</strong>, <strong>Activity</strong>.
      </p>

      <H3>Overview</H3>
      <p>
        The details card (client, event date, status, created), the status timeline with every
        transition and its note, and <strong>Notes</strong> — private to your studio, never shown to
        the client: shot lists, location details, anything. Questionnaires live here too: pick a{" "}
        <a href="/docs/templates">template</a>, send the client a private link (copy it or email
        it), and their answers land on the project the moment they submit. Pending shows until they
        do.
      </p>

      <H3>Files</H3>
      <p>
        The workspace. Drop files anywhere to upload — a queue tracks progress, retries failures,
        and pauses on demand, and a duplicate check offers to skip identical files before they
        upload twice. Filter by status, type, tags, star ratings, or color labels; sort; work in
        grid or list. File shots into <strong>folders</strong> (up to 100 per project) by dragging;
        deleted folders return files to Unfiled. Triage mode is fast culling — approve, reject, and
        star with the keyboard. Files in an active client gallery are locked, and the share panel
        delivers approved files or whole folders without leaving the tab.
      </p>

      <H3>Client gallery</H3>
      <p>
        Design the gallery (cover, layout, theme — the design layer is <a href="/docs/gallery-design">
        Lite and above</a>), see who opened it, and send the link: the client verifies by email code,
        and you can revoke or rotate it any time. Deliver whole folders, and override the studio
        watermark per project. The full surface is covered in{" "}
        <a href="/docs/gallery-delivery">Delivering galleries</a>.
      </p>

      <H3>Payments &amp; invoices</H3>
      <p>
        Set the quote total and the project derives its money state — unpaid, partial, paid, or
        overpaid — the same badge shown on the board. Stripe booking payments can be refunded (the
        booking cancels, the client is emailed, and you choose whether files go now or galleries
        stay until expiry); record manual payments by cash, e-transfer, cheque, or offline card,
        with void for mistakes. Refunds stop once work has begun — no refund after the project
        leaves Booked, and disputes freeze them entirely. Invoices compose from the quote or a
        preset, then send as a branded PDF with a secure client link.
      </p>

      <H3>Contracts</H3>
      <p>
        Draft from a template or the starter agreement, merge fields fill at send and freeze, and{" "}
        <strong>Send for signature</strong> emails the client a private link. Statuses run draft →
        sent → signed, with void to kill a link; the signed PDF stays on the project. Details in{" "}
        <a href="/docs/contracts">Contracts &amp; e-signing</a>.
      </p>

      <H3>Activity</H3>
      <p>
        One chronological feed from three streams: pipeline moves (from → to, with notes), client
        gallery access (opened the gallery, requested a verification code, verified, downloaded a
        file), and the studio audit trail — payments and refunds, bulk curation runs, notes edits,
        gallery links created or rotated, RAW vault moves. Blocked actions show as blocked, with
        the reason.
      </p>

      <Callout tone="info" title="The hub guards work in flight">
        Files in an active client gallery can&apos;t be deleted or rejected, payments past the
        booking can&apos;t be refunded, and signed contracts can&apos;t be changed — the guardrails
        are logged, not silent.
      </Callout>
      <Note>
        Nothing on the hub is shown to clients directly — they see their side through{" "}
        <a href="/docs/client-portal">the client portal</a>, galleries, and signing links.
      </Note>

      <Related slugs={["projects", "gallery-delivery", "payments", "contracts"]} />
    </>
  );
}
