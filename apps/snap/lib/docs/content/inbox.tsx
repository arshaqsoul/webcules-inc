/* Inbox (WEB-303/305) — the unified conversation + activity stream. Written
 * from the code: components/inbox/inbox-view.tsx (layout, filters, composer),
 * email-frame.tsx (sandboxed rendering), app/api/inbox/threads/[id]/reply
 * (sending, from-address, mirror copy), lib/inbox/sources.ts (what mints
 * items), lib/notify-client.ts (the toggles that gate minting). The triage
 * layer (tabs, snooze, keymap) ships separately — keep this page honest
 * about what exists today. */
import { H2, Callout, Related } from "@/lib/docs/primitives";

export default function Inbox() {
  return (
    <>
      <p>
        Gmail is where your attention lives; Snap is where the work happens. The inbox closes that gap:
        client emails and the studio&rsquo;s own activity — bookings, contracts, payments, gallery
        deliveries — sit in <strong>one stream</strong>, so nothing waits silently in a mail folder you
        never open.
      </p>

      <H2>One timeline per client</H2>
      <p>
        Pick any item and the reading pane opens the conversation behind it: the client&rsquo;s emails
        interleaved with compact event cards — &ldquo;Booking rescheduled&rdquo;, &ldquo;Invoice
        paid&rdquo;, &ldquo;Client opened their gallery for the first time&rdquo; — each with a
        one-click deep link to the booking, project or gallery it refers to. A client who signs a
        contract, replies to your email and opens their gallery weaves all three into one story you
        can read in ten seconds.
      </p>
      <p>
        Opening a conversation marks its notifications read — the same rule Linear uses. Nothing is
        deleted by reading: the underlying booking, contract or invoice keeps its own full history on
        its project.
      </p>

      <H2>Reading email, safely</H2>
      <p>
        Client emails render inside a locked sandbox with scripts dead by policy, on a forced white
        card that never inherits your app theme. Two behaviors you&rsquo;ll notice:
      </p>
      <ul>
        <li>
          <strong>Remote images stay blocked</strong> until you click <em>Load remote images</em> on
          that message — the tracking pixel an email carries never fires by default.
        </li>
        <li>
          <strong>Quoted history collapses.</strong> The &ldquo;On … wrote&rdquo; walls and signature
          blocks hide behind a <em>Show trimmed content</em> toggle — the text is still stored in
          full, just out of your way.
        </li>
      </ul>

      <H2>Replying</H2>
      <p>
        Replies send from <strong>your studio&rsquo;s own Snap address</strong> (your studio&rsquo;s
        name on <code>hello+…@snap.webcules.com</code>, with your contact address as Reply-To), so
        the client&rsquo;s answer threads straight back into the same conversation — never into a
        no-reply void.
      </p>
      <ul>
        <li>
          <strong>Saved replies</strong> (your email snippets) resolve their merge fields for the
          client you&rsquo;re writing to, then drop into the composer.
        </li>
        <li>
          The <strong>+ Gallery link</strong> button inserts the client&rsquo;s gallery link — v1
          replies don&rsquo;t carry file attachments, and a live link beats a 20&nbsp;MB zip anyway.
        </li>
        <li>
          Your <strong>business signature</strong> (legal name, address, phone, website — whatever
          you&rsquo;ve filled in under Settings → General) is appended automatically.
        </li>
        <li>
          <strong>Send a copy to your own inbox</strong> is on by default: while you build trust in
          the Snap inbox, every reply also lands in your regular mail, searchable and forwarded like
          any other email you&rsquo;ve sent.
        </li>
      </ul>
      <p>
        If an email fails to go out, the reply is still saved on the thread with a warning and a
        retry — failures are never silent.
      </p>

      <H2>What lands here</H2>
      <p>
        The toggles under <a href="/docs/notifications">Settings → Notifications</a> decide which
        events mint inbox notifications — turn a branch off (say, gallery activity) and neither the
        email nor the inbox item appears. The stream refreshes as you work: on opening the page, when
        you come back to the tab, and every 30 seconds.
      </p>

      <Callout tone="info" title="Inquiries live in both, on purpose">
        The Leads pipeline still owns qualification — the inbox shows the conversation, the board
        shows the deal. Same inquiries, two jobs.
      </Callout>

      <Related slugs={["notifications", "leads", "client-portal"]} />
    </>
  );
}
