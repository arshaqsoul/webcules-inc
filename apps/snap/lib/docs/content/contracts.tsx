/* Contracts & e-signing — written from lib/contracts.ts, lib/merge-fields.ts,
 * components/contract-template-editor.tsx (toolbar + clause library, not a
 * rich-text framework), and app/c/[token]/page.tsx + contract-sign.tsx. */
import { H2, H3, Note, Callout, Shot, Related } from "@/lib/docs/primitives";

export default function Contracts() {
  return (
    <>
      <p>
        Contracts are agreements your client e-signs in the browser. Build them from reusable
        templates with merge fields, send a private signing link, and the signed PDF archives
        itself on the project — no signer accounts, the link is the gate.
      </p>

      <Shot
        src="/docs-shots/contracts/signing.png"
        alt="The public signing page — the contract body, an Awaiting signature badge, and the typed-name sign form."
        grad="dusk"
      />

      <H2>Where contracts live</H2>
      <p>
        Two places. Per-project paperwork lives on the hub&apos;s{" "}
        <strong>Contracts</strong> tab: the drafts, the signing status, the PDF. The reusable
        versions live in <a href="/dashboard/templates/contracts">Templates → Contracts</a> — your
        new studio starts with a wedding agreement and a portrait agreement, ready to edit. Beside
        them sits the <strong>clause library</strong>: named paragraphs (image usage &amp;
        licensing, weather policy, retainer non-refundable, delivery timeline) you reuse across
        every agreement.
      </p>

      <H2>The template editor</H2>
      <p>
        The editor is a plain-text surface with a slim toolbar — bold, italic, heading, list, link
        — that wraps your selection in a small allowlist of tags, sanitized again on the server.
        An <strong>Insert field</strong> picker offers every merge field;{" "}
        <strong>Insert clause</strong> drops a saved paragraph at the cursor. A live preview pane
        labeled <em>signing page</em> renders the exact document your client will see.
      </p>
      <Callout tone="info" title="Applying copies, never links">
        Applying a template copies its text into the contract at that moment. Editing the template
        afterwards never changes contracts you already sent — or ones already signed.
      </Callout>

      <H2>Merge fields</H2>
      <p>
        Double-brace placeholders fill from real studio, project, and client data at send time:
        <code>{"{{client_name}}"}</code>, <code>{"{{studio_name}}"}</code>,{" "}
        <code>{"{{event_date}}"}</code>, <code>{"{{total}}"}</code>, <code>{"{{deposit}}"}</code>,{" "}
        <code>{"{{session_type}}"}</code>, legal-name variants for agreement language, invoice
        number and total, today&apos;s date, and the link fields — booking, gallery, portal, and
        the contract&apos;s own <code>{"{{sign_url}}"}</code>. The quick composer on a project
        offers the five classics: client, studio, date, event date, package.
      </p>
      <Note>
        Unknown fields pass through untouched so drafts stay editable, and a field with no data to
        fill falls back to a human phrase — <em>the scheduled date</em>, not an empty hole.
      </Note>

      <H2>Send for signature</H2>
      <p>
        Statuses: <strong>draft</strong> → <strong>sent</strong> → <strong>signed</strong>, with{" "}
        <strong>void</strong> off to the side. Sending fills the merge fields and freezes them into
        the stored body, mints a private token link (kept only hashed and encrypted), and emails
        the client. Voiding a draft or sent contract stops the link working. Signed contracts
        can&apos;t be changed — by anyone.
      </p>

      <H2>What the client sees</H2>
      <p>
        A calm single page on your brand: the studio name, <em>Prepared for</em> their email, the
        full agreement, an <strong>Awaiting signature</strong> badge. To sign, they type their full
        legal name and complete a bot check, then hit <strong>Sign contract</strong>. The page says
        plainly what that means: signing records the typed name, the date and time, and the IP
        address for both parties&apos; records.
      </p>
      <p>
        The moment it&apos;s signed, the page flips to <strong>Signed</strong> — signer, timestamp,
        IP, and a <strong>Download signed PDF</strong> button. A branded PDF (your logo and accent,
        the signer&apos;s name, IP, and the signed-at time) is archived and emailed to both parties;
        the studio copy respects your contract-signed alert toggle. It stays on the project&apos;s
        Contracts tab, next to the audit entries for sent, signed, and voided.
      </p>
      <Callout tone="warn" title="Evidence, not notarization">
        Snap records typed names with technical evidence — timestamp, IP, browser — and archives
        the PDF. It is not a notary or a drawn-signature tool; if your jurisdiction requires
        witnesses, capture those separately.
      </Callout>

      <Related slugs={["template-library", "project-hub", "projects"]} />
    </>
  );
}
