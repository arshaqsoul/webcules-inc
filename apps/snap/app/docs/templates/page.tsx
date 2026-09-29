/* /docs/templates (WEB-256) — the templates guide: one screen per designer,
 * where each artifact lives and applies. */
import Link from "next/link";

export const metadata = { title: { absolute: "Templates guide · Snap" } };

const card = "rounded-[12px] border border-hairline bg-surface-1 p-5";

function Designer({
  title,
  home,
  children,
}: {
  title: string;
  home: string;
  children: React.ReactNode;
}) {
  return (
    <section className={card}>
      <h2 className="text-[15px] font-medium text-ink">{title}</h2>
      <p className="mt-0.5 text-xs text-ink-tertiary">Lives in {home}</p>
      <div className="mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-ink-subtle">{children}</div>
    </section>
  );
}

export default function DocsTemplatesPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Templates</h1>
      <p className="text-sm leading-relaxed text-ink-subtle">
        One library for everything reusable in your studio. Manage it all from{" "}
        <Link href="/dashboard/templates" className="font-medium text-primary hover:underline">
          Templates
        </Link>{" "}
        in the sidebar — every starter below is already in your library, ready to edit.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Designer title="Contract templates" home="Templates → Contracts">
          <p>Your agreements with merge fields that fill from the project at send (client, dates, totals, deposits). The clause library inserts reusable paragraphs at the cursor, and the preview shows exactly what the client signs.</p>
          <p>Apply from a project&apos;s Contracts tab — applying copies the text, so editing a template never changes contracts you already sent.</p>
        </Designer>
        <Designer title="Forms & questionnaires" home="Templates → Forms & questionnaires">
          <p>Design your contact form&apos;s questions — your own fields, event-type options, thank-you copy and a redirect. Multiple forms (one per page or campaign) on Studio.</p>
          <p>Questionnaires send from a project&apos;s Overview tab: the client answers on a private link and the answers land on the project.</p>
        </Designer>
        <Designer title="Email snippets" home="Templates → Email snippets; Settings → Brand → Emails">
          <p>Canned replies insert into any lead thread with merge fields resolved. System-email copy (subjects and opening lines) is customized in Brand → Emails with a live preview.</p>
        </Designer>
        <Designer title="Invoice presets & design" home="Templates → Invoice presets; Settings → Billing → Invoice design">
          <p>Packages (Wedding Collection, Portrait, Mini) drop onto any invoice. Invoice design sets your numbering, default tax, terms and notes — snapshotted per invoice so old documents never change.</p>
        </Designer>
        <Designer title="Session types" home="Calendar → Availability">
          <p>Give each offering its own duration, price, deposit, booking questions and hours — clients pick a type, then a time. They&apos;re scheduling config, so they live with your calendar, not in the template library.</p>
        </Designer>
        <Designer title="Booking page" home="Settings → Embeds & links → Booking page">
          <p>Your hero copy, an intro, FAQ, social links and a custom thank-you on your public booking page — with the live page as the preview.</p>
        </Designer>
      </div>
    </div>
  );
}
