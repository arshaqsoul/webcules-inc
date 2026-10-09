/* Inbox (WEB-303/305/306) — the unified conversation + activity stream and
 * its triage layer. Written from the code: components/inbox/inbox-view.tsx
 * (tabs, keymap, actions, search), email-frame.tsx (sandboxed rendering),
 * command-menu/shortcuts-sheet/snooze-dialog/nav-badge, app/api/inbox
 * (list/actions/bulk/badge), lib/inbox/sources.ts (what mints items),
 * lib/notify-client.ts (the toggles that gate minting). */
import { H2, Callout, Related } from "@/lib/docs/primitives";
import { EMAIL_DOMAIN } from "@/lib/hosts";

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
        Replies send from <strong>the thread&rsquo;s own address</strong> — a private{" "}
        <code>t-…@{EMAIL_DOMAIN}</code> endpoint minted per conversation, with your contact
        address as Reply-To — so the client&rsquo;s answer threads straight back into the same
        conversation even if every header is stripped, and never into a no-reply void.
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

      <H2>Triage at speed</H2>
      <p>
        The list has four tabs. <strong>All</strong> is everything open; <strong>Unread</strong>{" "}
        is what you haven&rsquo;t seen; <strong>Needs reply</strong> narrows to conversations
        where the client spoke last; <strong>Needs triage</strong> holds the odd ones — events
        that matched no conversation yet. The <strong>Filter</strong> menu (press{" "}
        <strong>F</strong>) slices the stream by kind — emails, bookings, contracts, payments,
        galleries, inquiries — and the search box covers titles and previews. The divider
        between the list and the conversation drags to whatever split suits your screen
        (double-click resets it), and Snap remembers your choice.
      </p>
      <p>
        The inbox is built to be driven from the keyboard, Linear-style:{" "}
        <strong>j/k</strong> move the selection, <strong>Enter</strong> opens (or closes) the
        conversation, <strong>U</strong> toggles read, <strong>H</strong> snoozes,{" "}
        <strong>Backspace</strong> deletes — <strong>Alt+U</strong> marks everything read,{" "}
        <strong>Shift+Backspace</strong> clears everything read, and <strong>⌘K</strong> opens
        the command menu. Press <strong>?</strong> any time for the full sheet.
      </p>
      <p>
        <strong>Snooze</strong> hides an item until a moment you pick — later today, tomorrow
        morning, next week, or a custom time — then it resurfaces unread. Nothing is lost: the
        underlying lead, booking or invoice keeps its own history whatever you do here, and the
        sidebar&rsquo;s Inbox badge always equals your open unread items, mirrored into the
        browser tab title so a backgrounded tab still signals.
      </p>

      <H2>How replies find their thread</H2>
      <p>
        Emails are messy: some clients strip headers, Outlook ignores the standard threading
        fields, and forwards arrive wearing someone else&rsquo;s envelope. Snap&rsquo;s inbound
        pipeline resolves every reply through five signals in order — the standard
        In-Reply-To/References chain, Snap&rsquo;s own thread header, Outlook&rsquo;s
        Thread-Index, the unique per-conversation reply address your mail now carries, and
        finally a normalized subject match with the same client within 45 days. Anything that
        survives all five lands under <strong>Needs triage</strong> instead of vanishing — and
        from there Snap asks rather than guesses: attach the email to the client, lead or project
        it belongs to, and if that project has no client yet a <strong>Connect a client</strong>{" "}
        prompt opens with the sender already filled in. Conversations that were left without a
        client show the same <strong>Connect a client</strong> button where the reply box would
        be, so a reply always has somewhere to go.
      </p>
      <p>
        Two safety nets while the inbox is young. <strong>Reply mirroring</strong> (Settings →
        Notifications) drops a copy of every client reply into your own mail — tagged with
        X-Snap headers so you can filter them — and you can switch it off once the inbox is
        home. And mail over 25&nbsp;MiB is politely refused with a note to share via a gallery
        link instead. Tracking pixels are stripped from stored email on arrival; remote images
        stay click-to-load.
      </p>
      <Callout tone="info" title="Keep your existing Gmail flowing in">
        Want the mail you already receive to appear in Snap too? In Gmail, set up a filter
        (or forwarding rule) that forwards a copy to your studio&rsquo;s Snap reply address —
        <code>hello+your-studio@{EMAIL_DOMAIN}</code>. Forwarded copies keep their original
        sender (Snap unwraps the forwarding envelope), so they thread to the right client.
      </Callout>

      <Callout tone="info" title="Inquiries live in both, on purpose">
        The Leads pipeline still owns qualification — the inbox shows the conversation, the board
        shows the deal. Same inquiries, two jobs.
      </Callout>

      <Callout tone="warn" title="What the inbox isn't (yet)">
        No two-way Gmail sync — your existing mail flows in via the
        auto-forward recipe above, and replies you write send from your
        Snap address (a copy can land in your own inbox). Attachments
        don't ride replies (email caps at a few MB) — share gallery links
        instead. SMS and AI drafting are deliberate future projects, not
        hidden features.
      </Callout>

      <Related slugs={["notifications", "leads", "client-portal"]} />
    </>
  );
}
