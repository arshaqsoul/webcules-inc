import type { Metadata } from "next/types";

import { LegalPage } from "@/components/shared/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | Webcules",
  description:
    "How Webcules Inc. collects, uses and protects personal information across our website and client engagements.",
};

const UPDATED = "September 9, 2026";

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      intro="Webcules Inc. ('Webcules', 'we', 'us') provides custom software development, design and data services. This policy explains what personal information we collect through webcules.com and during client engagements, how we use it, and the choices you have."
      sections={[
        {
          heading: "1. Information we collect",
          paragraphs: [
            "We collect only the information we need to respond to you and deliver our services:",
          ],
          bullets: [
            "Contact details you give us — name, email address, phone number, company and project details — when you book a call, email us, message us on WhatsApp or use any form on this site.",
            "Communication records — emails, call notes and messages related to your inquiry or project.",
            "Scheduling data — if you book a discovery call, your booking is handled by Cal.com; their privacy policy applies to the scheduling data they process.",
            "Usage data — basic technical data (pages visited, approximate location, device/browser type) collected through standard hosting logs on Cloudflare.",
            "Client project data — during an engagement we may access systems, credentials, data and materials you provide for the purpose of delivering the agreed work.",
          ],
        },
        {
          heading: "2. How we use information",
          bullets: [
            "To respond to inquiries and prepare proposals, statements of work and contracts.",
            "To deliver, manage and support the services you have engaged us for, including development, design, data engineering and deployment work.",
            "To invoice and collect payment for our services, including through third-party payment processors such as Stripe.",
            "To communicate about active projects, schedules, deliverables and support.",
            "To maintain the security and performance of our website and internal systems.",
            "To meet legal, accounting and regulatory obligations.",
          ],
        },
        {
          heading: "3. Client data and confidentiality",
          paragraphs: [
            "When we build software or process data for you, you remain the owner and controller of your data. We act as a service provider: we use client data solely to perform the contracted work, we restrict access to team members working on your project, and we keep it confidential during and after the engagement.",
            "We do not sell personal information, and we do not use client project data to train AI models or for any purpose other than delivering your project.",
          ],
        },
        {
          heading: "4. Third-party services",
          paragraphs: [
            "We rely on a small set of trusted processors to operate. These include Cal.com (call scheduling), Stripe (payments), Google Workspace (email and documents), Cloudflare (hosting, DNS and storage) and project tools we agree on with you (for example GitHub, Figma or Linear). These providers process data on our behalf under their own privacy and security terms.",
          ],
        },
        {
          heading: "5. Cookies and analytics",
          paragraphs: [
            "This website uses only strictly necessary cookies and hosting-level logs required for the site to function. If we add optional analytics or marketing cookies in the future, we will update this policy and obtain consent where required.",
          ],
        },
        {
          heading: "6. Data retention",
          paragraphs: [
            "Inquiry and client records are kept for as long as needed to provide services and to meet legal, tax and accounting requirements (typically up to seven years for financial records). Client project data is returned or deleted at the end of an engagement as agreed in your statement of work, unless retention is required by law.",
          ],
        },
        {
          heading: "7. How we protect information",
          paragraphs: [
            "We use industry-standard safeguards: encrypted connections (HTTPS/TLS), access controls and least-privilege access to client systems, secrets management, and reputable cloud infrastructure. No method of transmission or storage is perfectly secure, but we review and improve our practices on an ongoing basis.",
          ],
        },
        {
          heading: "8. Your rights and choices",
          paragraphs: [
            "You may ask us to access, correct or delete the personal information we hold about you, or withdraw consent for optional communications, at any time. We serve clients in Canada and internationally and handle requests in line with applicable privacy laws, including Canada's PIPEDA. To make a request, email business@webcules.com — we respond within 30 days.",
          ],
        },
        {
          heading: "9. Changes to this policy",
          paragraphs: [
            "We may update this policy as our services or the law evolve. The 'Last updated' date above shows the current version. Material changes will be highlighted on this page.",
          ],
        },
      ]}
    />
  );
}
