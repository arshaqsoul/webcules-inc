/* Terms of Service — public legal page (Stripe live-mode requirement).
 * Plain server component, styled like the /docs pages. Keep factual: every
 * claim here mirrors shipped behavior (billing via Stripe, dormancy purge,
 * RAW vault lifecycle, plan limits from lib/plans-data.ts). */
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Snap, the studio platform for photographers by Webcules.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[17px] font-semibold tracking-[-.3px] text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-subtle">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-[-.8px] text-ink">Terms of Service</h1>
        <p className="text-sm leading-relaxed text-ink-subtle">
          Effective September 29, 2026. These terms (&ldquo;Terms&rdquo;) govern your use of Snap, the studio
          management platform operated by <strong>Webcules Inc.</strong> (&ldquo;Snap&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;) at snap.webcules.com. By creating an account or using Snap, you agree to them.
        </p>
      </header>

      <Section title="1. The service">
        <p>
          Snap provides studio management for photographers: client CRM, bookings and scheduling, contracts and
          e-signatures, invoices and payments, client photo galleries with delivery and downloads, and file storage.
          Features and plan limits are described on our pricing page; storage and gallery limits are enforced in
          the product and visible in Settings.
        </p>
      </Section>

      <Section title="2. Your account">
        <p>
          You must be able to form a binding contract to use Snap. Keep your credentials confidential — you are
          responsible for activity under your account. Provide accurate information for your studio profile and
          billing. If you invite team members to your studio, you are responsible for their use of Snap within
          your organization.
        </p>
      </Section>

      <Section title="3. Acceptable use">
        <p>You may not use Snap to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>store or share content you do not have the rights to, including photographs taken without the subject&apos;s or client&apos;s consent where required;</li>
          <li>store or distribute unlawful content, or content involving minors in any unlawful or sexualized manner (zero tolerance, reported to authorities);</li>
          <li>harass others, send unsolicited commercial email, or circumvent the security, rate limits, or access controls of the service;</li>
          <li>resell access to Snap without a written agreement with us.</li>
        </ul>
        <p>
          We may suspend or remove content and accounts that violate these rules. Galleries are protected by
          one-time codes, expiring links, and download controls — attempting to bypass them against a studio&apos;s
          wishes is a violation of these Terms.
        </p>
      </Section>

      <Section title="4. Your content">
        <p>
          You keep all rights to the photos, videos, documents, and other material you upload or create in Snap
          (&ldquo;Your Content&rdquo;). We claim no ownership. You grant us only the limited right to store,
          process, and display Your Content as needed to run the service — for example, rendering your galleries
          to the clients you choose to share them with.
        </p>
        <p>
          Regarding personal data of your clients (names, email addresses, gallery activity): you are the data
          controller and must have a lawful basis to share it with us; we process it as your processor, on your
          instructions, as described in our Privacy Policy.
        </p>
      </Section>

      <Section title="5. Subscriptions, billing, and refunds">
        <p>
          Paid plans are billed monthly in advance through Stripe, our payment processor. We never see or store
          your full card details. Subscriptions renew automatically until cancelled. You can cancel any time in
          Settings → Billing; cancellation takes effect at the end of the current billing period and your plan
          stays active until then.
        </p>
        <p>
          Plan storage is a pooled allowance. Plans with metered overage bill for storage used beyond the included
          allowance at the published per-GB rate, capped as described on the pricing page. Uploads are refused at
          the hard lock stated for your plan. Add-ons (such as extra custom domains) bill with your subscription.
        </p>
        <p>
          <strong>Refunds:</strong> if a paid plan isn&apos;t working for you, contact us within 14 days of your
          first charge and we&apos;ll refund it in full. Beyond that, charges are non-refundable except where
          required by law. Client-facing payments (invoices, deposits) flow through your own Stripe account —
          refunds of those payments are between you and your client.
        </p>
      </Section>

      <Section title="6. Data lifecycle and storage">
        <p>
          To keep the platform healthy, studios on the Free plan that are inactive for an extended period (about
          180 days) receive notice emails and then have their stored files permanently deleted. All plans receive
          warnings before any RAW file lifecycle action (archive or scheduled deletion). You can export or delete
          your data at any time. Deleting your account removes Your Content and your studio data.
        </p>
      </Section>

      <Section title="7. Client-facing surfaces">
        <p>
          Your clients use parts of Snap — booking pages, contact forms, galleries, the client app — without
          being parties to these Terms. You are responsible for the links you share and for having your
          clients&apos; consent to deliver their photos through Snap. We may display a &ldquo;Delivered by
          Snap&rdquo; notice on client surfaces for studios on plans without white-label.
        </p>
      </Section>

      <Section title="8. Availability and changes">
        <p>
          We target high availability but do not promise uninterrupted service. We may add, change, or retire
          features; material reductions to a plan you are paying for will come with advance notice and, where
          appropriate, a pro-rata option. Planned maintenance is announced in the product when practical.
        </p>
      </Section>

      <Section title="9. Termination">
        <p>
          You may close your account at any time; export anything you want to keep first. We may suspend or
          terminate accounts for non-payment, violation of these Terms, or where required by law. On termination
          for violation we may delete stored content. Sections that should survive termination (ownership,
          disclaimers, liability) survive.
        </p>
      </Section>

      <Section title="10. Disclaimers and liability">
        <p>
          The service is provided &ldquo;as is&rdquo; without warranties of any kind beyond what the law implies.
          To the maximum extent permitted by law, our total liability arising out of or relating to Snap is
          limited to the amount you paid us in the 12 months before the claim. We are not liable for indirect or
          consequential damages, including lost profits or lost data that you could have exported. You agree to
          indemnify us against third-party claims arising from Your Content or your breach of these Terms.
        </p>
        <p>
          These Terms do not limit liability for fraud, willful misconduct, or anything else that cannot be
          limited by law.
        </p>
      </Section>

      <Section title="11. Changes and contact">
        <p>
          We may update these Terms; material changes are announced by email to your account address at least 7
          days before taking effect. Continued use after the effective date means acceptance.
        </p>
        <p>
          Questions, notices, or refund requests: <strong>hello@snap.webcules.com</strong>. These Terms are
          governed by the laws of the State of Delaware, USA, without regard to conflict-of-law rules.
        </p>
      </Section>
    </div>
  );
}
