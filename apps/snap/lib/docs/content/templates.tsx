/* Templates guide — a restructure of app/docs/templates/page.tsx (approved
 * copy preserved, shell primitives applied). Caps verified against
 * lib/plans-data.ts + lib/repos/templates.ts; the file-upload and custom-field
 * gates against app/dashboard/templates/forms/page.tsx + lib/forms.ts. */
import { H2, H3, Note, Callout, Tier, Related } from "@/lib/docs/primitives";

export default function Templates() {
  return (
    <>
      <p>
        One library for everything reusable in your studio, under <strong>Templates</strong> in the
        sidebar. You never start from zero: every new studio is seeded with a starter of each kind
        — a wedding agreement, an intake form, canned replies, invoice packages, gallery looks —
        ready to edit.
      </p>

      <H2>Where each designer lives</H2>
      <table>
        <thead>
          <tr>
            <th>Designer</th>
            <th>Lives in</th>
            <th>Applies from</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Contract templates</td>
            <td><code>Templates → Contracts</code></td>
            <td>A project&apos;s Contracts tab</td>
          </tr>
          <tr>
            <td>Forms &amp; questionnaires</td>
            <td><code>Templates → Forms &amp; questionnaires</code></td>
            <td>Contact widget, booking forms, project Overview tab</td>
          </tr>
          <tr>
            <td>Email snippets</td>
            <td><code>Templates → Email snippets</code></td>
            <td>Lead inbox replies</td>
          </tr>
          <tr>
            <td>Invoice presets <Tier plan="lite" /></td>
            <td><code>Templates → Invoice presets</code></td>
            <td>Composing an invoice</td>
          </tr>
          <tr>
            <td>Gallery styles <Tier plan="lite" /></td>
            <td><code>Templates → Gallery styles</code></td>
            <td>A project&apos;s Client gallery tab</td>
          </tr>
          <tr>
            <td>Session types</td>
            <td><code>Templates → Session types</code></td>
            <td>Your booking page: clients pick a type, then a time</td>
          </tr>
        </tbody>
      </table>

      <H2>The designers</H2>

      <H3>Contract templates</H3>
      <p>
        Your agreements with merge fields that fill from the project at send — client, dates,
        totals, deposits. The clause library inserts reusable paragraphs at the cursor, and the
        live preview shows exactly what the client signs. The whole flow is in{" "}
        <a href="/docs/contracts">Contracts &amp; e-signing</a>.
      </p>

      <H3>Forms &amp; questionnaires</H3>
      <p>
        One schema engine for every question you ask: text, paragraph, choice, date, email, phone,
        and checkbox fields, plus file uploads on Studio. Custom fields — anything beyond the
        standard lead columns — are capped at two on Free and Lite. Questionnaires send from a
        project&apos;s Overview tab as a private link, and answers land on the project.
      </p>

      <H3>Email snippets</H3>
      <p>
        Canned replies that insert into any lead thread with merge fields resolved. System-email
        copy — subjects and opening lines for bookings, galleries, contracts — is customized
        separately in <code>Settings → Brand → Emails</code>, with a live preview.
      </p>

      <H3>Invoice presets <Tier plan="lite" /></H3>
      <p>
        Packages like <em>Wedding Collection</em> or <em>Portrait Session</em> drop onto any
        invoice you compose, lines pre-filled and yours to tweak. Invoice design — numbering,
        default tax, terms, notes — lives in <code>Settings → Billing</code>, snapshotted per
        invoice so old documents never change.
      </p>

      <H3>Gallery styles <Tier plan="lite" /></H3>
      <p>
        Cover treatment, layout, and theme as one reusable look, previewed desktop and mobile.
        Pin a studio default and every new gallery inherits it until you design it
        differently. See <a href="/docs/gallery-design">Gallery design &amp; styles</a>.
      </p>

      <H3>Session types</H3>
      <p>
        What you sell: duration, price, deposit, availability, and the booking form each one
        asks. They moved here from Calendar — the schedule itself still lives in{" "}
        <a href="/docs/calendar">Calendar</a>; this is the offering list clients choose from.
      </p>
      <Note>
        Your booking page&apos;s own copy — hero, FAQ, thank-you — is customized on the{" "}
        <a href="/docs/booking-page">booking page</a> itself, not in this library.
      </Note>

      <H2>Caps by plan</H2>
      <p>
        On Free and Lite: <strong>2</strong> contract templates, <strong>5</strong> email snippets,{" "}
        <strong>1</strong> contact form, <strong>1</strong> questionnaire (3 on Lite), and{" "}
        <strong>1</strong> session type (3 on Lite). Studio and above are unlimited. Invoice
        presets and gallery styles aren&apos;t counted — they&apos;re Lite and above, full stop.
        One exception: a gallery look saved from the page builder counts toward Lite&apos;s one
        saved custom look; designer presets and the seeded starters never count. Starters
        beyond your cap aren&apos;t deleted; they sit dormant in the library until you upgrade.
      </p>
      <Callout tone="info" title="Applying copies">
        The rule that makes the library safe to edit: applying a template or sending a contract
        copies its text at that moment. Later edits never rewrite what you already sent. Templates
        with history — a questionnaire someone answered — refuse deletion; archive instead, and
        restore any time.
      </Callout>

      <Related slugs={["contracts", "gallery-design", "project-hub", "billing-plans"]} />
    </>
  );
}
