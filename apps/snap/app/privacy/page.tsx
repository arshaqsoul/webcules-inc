/* Privacy Policy — public legal page (Stripe live-mode requirement).
 * Must stay truthful to what Snap actually collects: essential-only cookies,
 * first-party logs, Stripe/Cloudflare as the only processors, dormancy purge,
 * 180-day gallery access-log retention, photographer-as-controller framing. */
import type { Metadata } from "next";
import { PUBLIC_HOST, emailAddress } from "@/lib/hosts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Snap by Webcules collects, why, how long we keep it, and the choices you and your clients have.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[17px] font-semibold tracking-[-.3px] text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-subtle">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-[-.8px] text-ink">Privacy Policy</h1>
        <p className="text-sm leading-relaxed text-ink-subtle">
          Effective September 29, 2026. This policy explains how <strong>Webcules Inc.</strong> (&ldquo;Snap&rdquo;,
          &ldquo;we&rdquo;) handles personal data when you use {PUBLIC_HOST}. Snap is built for professional
          photographers, so it matters from the start: <strong>you are the controller of your clients&apos; personal
          data</strong> (their email addresses, gallery activity, and the photos you upload of them) and we process
          that data on your behalf as a processor. For your account and billing data, we are the controller.
        </p>
      </header>

      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Your account:</strong> name, email address, hashed password, studio profile (studio name, timezone, contact email, branding).</li>
          <li><strong>Billing:</strong> subscription and payment status via Stripe. Card numbers go directly to Stripe — we never see or store them.</li>
          <li><strong>Your studio content:</strong> photos, videos, RAW files, contracts, invoices, leads, and bookings you create or upload.</li>
          <li><strong>Your clients&apos; data (as your processor):</strong> the email addresses you deliver to, one-time codes sent to them, their favorites, selections and notes, download requests, and gallery viewing activity shown in your dashboard.</li>
          <li><strong>Security and operations logs:</strong> sign-in records, gallery access logs (kept 180 days), rate-limiting counters, and an internal audit trail of actions taken in your studio.</li>
        </ul>
      </Section>

      <Section title="Cookies and tracking">
        <p>
          Snap uses only essential cookies: your sign-in session, gallery access grants, and download
          authorizations. We run <strong>no third-party analytics, advertising, or tracking scripts</strong> on any
          Snap surface — the usage numbers you see in your dashboard are computed from our own first-party logs.
        </p>
      </Section>

      <Section title="Why we process data">
        <p>
          To provide the service you signed up for (storing and delivering your work, running bookings and
          contracts, sending transactional email such as gallery codes and booking confirmations), to keep the
          platform secure and rate-limited against abuse, to bill subscriptions, and to comply with law. We do not
          sell personal data, and we do not use your content or your clients&apos; data for advertising or to train
          machine-learning models.
        </p>
      </Section>

      <Section title="Who processes data for us">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Cloudflare</strong> — hosting, database, file storage, and email delivery for the Snap application.</li>
          <li><strong>Stripe</strong> — subscription and invoice payments (for client-facing invoices, payments run through your own Stripe account, not ours).</li>
        </ul>
        <p>
          Data is stored on Cloudflare&apos;s global network; where personal data is transferred internationally,
          we rely on the safeguards our processors offer (such as EU standard contractual clauses).
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Account and studio data: for as long as your account is active, plus a short grace period to allow
          recovery or export. Gallery access logs: 180 days. One-time codes: until used, then deleted. Dormant
          free studios: after roughly 180 days of inactivity (with notice emails at 150 and 170 days), stored
          files are permanently deleted. When you delete your account, your stored content is removed.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <p>
          You can export or delete projects and galleries from the product, close your account from Settings, and
          keep your plan&apos;s storage behavior visible in Settings → Billing. Depending on where you live (for
          example in the EU, UK, or California), you may have rights to access, correct, export, or delete
          personal data, to object to or restrict processing, and to lodge a complaint with a supervisory
          authority. To exercise any of these, email <strong>{emailAddress("hello")}</strong> — we respond within
          30 days.
        </p>
        <p>
          If you are a photographer whose client asks for their data (a gallery visitor requesting deletion of
          their email or activity), route it to us and we will action it on your behalf.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Files are stored in a private bucket with no public access — they are served only through
          authorization-checked endpoints. Galleries are protected by expiring links and one-time codes; downloads
          can require PINs and approval. Access is logged so you can see who opened what. We apply least
          privilege internally and encrypt traffic in transit.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Snap is intended for professionals and is not directed to children. Do not upload photographs of
          minors except where you have the necessary consents for your professional work; gallery visitors of any
          age only receive content their photographer shared with them.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We may update this policy; material changes are announced by email at least 7 days before they take
          effect. Questions or requests: <strong>{emailAddress("hello")}</strong>.
        </p>
      </Section>
    </div>
  );
}
