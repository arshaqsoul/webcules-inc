import type { Metadata } from "next/types";

import { LegalPage } from "@/components/shared/legal-page";

export const metadata: Metadata = {
  title: "Terms & Conditions | Webcules",
  description:
    "The terms that govern use of the Webcules website and our custom software development engagements.",
};

const UPDATED = "September 9, 2026";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      updated={UPDATED}
      intro="These terms govern your use of webcules.com and, together with any statement of work (SOW) we both sign, the services provided by Webcules Inc. ('Webcules', 'we', 'us') to you or your organization ('you', 'Client'). By using this site or engaging us, you agree to these terms."
      sections={[
        {
          heading: "1. Our services",
          paragraphs: [
            "Webcules provides custom software development services, including web and mobile application development, product and UI/UX design, data engineering, and deployment/DevOps support. The specific services, deliverables, timeline and fees for your project are defined in an SOW, proposal or agreed sprint plan, which prevails over these general terms if there is a conflict.",
          ],
        },
        {
          heading: "2. Engagement models",
          bullets: [
            "Fixed-scope projects — a one-time engagement with a defined deliverable and price, quoted after discovery.",
            "Sprint plans — recurring bi-weekly sprints (as described on our pricing page) in which we deliver prioritized work in two-week cycles.",
            "Custom arrangements — anything else we agree in writing.",
          ],
          paragraphs: [
            "Work begins once the applicable SOW or sprint plan is agreed and, where required, the first invoice is paid.",
          ],
        },
        {
          heading: "3. Client responsibilities",
          paragraphs: [
            "You agree to provide timely decisions, feedback, content, domain/system access and third-party credentials or licenses reasonably required for the work. Delays in these inputs may shift timelines. You confirm that materials you supply do not infringe the rights of others and that you have the authority to engage us.",
          ],
        },
        {
          heading: "4. Quotes, invoices and payment",
          bullets: [
            "Prices on our website are indicative; binding fees are stated in your SOW or sprint plan.",
            "Fixed projects are invoiced per milestones or as stated in the SOW. Sprint plans are invoiced at the start of each billing period.",
            "Invoices are due within 15 days unless otherwise agreed. Late amounts may accrue interest at 1.5% per month, and we may pause work on overdue accounts after notice.",
            "Third-party costs (hosting, domains, licenses, AI/API usage) are billed at cost or run on your own accounts.",
          ],
        },
        {
          heading: "5. Scope changes",
          paragraphs: [
            "Work outside the agreed scope is handled through a written change request describing the change and any adjustment to fees and timeline. Sprint-plan clients simply re-prioritize backlog items with us — that flexibility is built into the model.",
          ],
        },
        {
          heading: "6. Intellectual property",
          bullets: [
            "On full payment, you own the final deliverables created specifically for your project (source code, designs and content produced for you).",
            "We retain ownership of our pre-existing tools, templates, libraries and general know-how, and grant you a perpetual, royalty-free license to use them as embedded in your deliverables.",
            "We may reference the engagement and display non-confidential work in our portfolio and marketing, unless you ask us in writing not to.",
            "Confidential information disclosed by either party stays confidential and is used only for the engagement.",
          ],
        },
        {
          heading: "7. Warranties and disclaimers",
          paragraphs: [
            "We warrant that services will be performed with reasonable skill and care, and we will correct defects in our deliverables reported within 30 days of handover at no charge. Beyond that, services and deliverables are provided 'as is' without other warranties, express or implied. We do not guarantee specific business results, revenue, or that third-party platforms will remain bug-free or unchanged.",
          ],
        },
        {
          heading: "8. Limitation of liability",
          paragraphs: [
            "To the maximum extent permitted by law, neither party is liable for indirect, incidental or consequential damages (including lost profits or data). Our total liability under an engagement is limited to the fees you paid us under that engagement in the three months preceding the claim. Nothing limits liability that cannot be limited by law.",
          ],
        },
        {
          heading: "9. Third-party services",
          paragraphs: [
            "Projects often rely on third-party platforms (cloud hosts, APIs, AI providers, payment processors). Their availability, pricing and terms are outside our control; we will flag material dependencies during discovery and help you choose sensible options.",
          ],
        },
        {
          heading: "10. Termination",
          paragraphs: [
            "Either party may end an engagement with 14 days' written notice, or immediately for material breach that remains uncured. Fixed projects are terminated per the SOW; sprint plans end at the close of the current billing period. You pay for work performed and expenses incurred up to termination, and we hand over completed work and materials.",
          ],
        },
        {
          heading: "11. General",
          paragraphs: [
            "These terms are governed by the laws of the Province of Saskatchewan and the federal laws of Canada applicable there. If any provision is unenforceable, the rest stays in force. We may update these terms from time to time; the version in effect when you engage us applies to that engagement.",
          ],
        },
        {
          heading: "12. Contact",
          paragraphs: [
            "Questions about these terms: business@webcules.com or +1 639 998 6044. Webcules Inc., Saskatoon, Saskatchewan, Canada.",
          ],
        },
      ]}
    />
  );
}
