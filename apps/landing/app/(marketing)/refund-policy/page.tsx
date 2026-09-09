import type { Metadata } from "next/types";

import { LegalPage } from "@/components/shared/legal-page";

export const metadata: Metadata = {
  title: "Refund Policy | Webcules",
  description:
    "How refunds, cancellations and billing work for Webcules custom software development engagements.",
};

const UPDATED = "September 9, 2026";

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      updated={UPDATED}
      intro="Webcules sells professional services — custom software development, design and data engineering — not off-the-shelf products. This policy explains when refunds apply and how cancellations work for fixed-scope projects and bi-weekly sprint plans. It forms part of our Terms & Conditions."
      sections={[
        {
          heading: "1. Services are billed for work performed",
          paragraphs: [
            "Our fees cover senior developer and designer time, committed in sprints or project milestones. Once work has been performed for a billing period or milestone, that time cannot be 'returned', so completed work is non-refundable except as described below.",
          ],
        },
        {
          heading: "2. Fixed-scope projects",
          bullets: [
            "Deposits become non-refundable once discovery work begins, as the time is spent.",
            "Milestone payments are refundable only if a milestone has not started and you cancel before it commences.",
            "If we cancel the project for reasons within our control, you receive a pro-rata refund for work not yet performed.",
          ],
        },
        {
          heading: "3. Sprint plans (Atom, Molecule, Compound)",
          bullets: [
            "You may cancel a sprint plan any time with 14 days' written notice to business@webcules.com; cancellation takes effect at the end of the current billing period.",
            "The current billing period is not refundable, since the sprint capacity was reserved and used for your backlog.",
            "Unused sprint capacity does not roll over and is not refundable, unless we agree otherwise in writing.",
            "If you have paid for a future billing period before cancelling, that not-yet-started period is refunded in full.",
          ],
        },
        {
          heading: "4. Our quality guarantee",
          paragraphs: [
            "Defects in our deliverables are fixed free of charge if reported within 30 days of handover (see our Terms & Conditions). If we miss an agreed deliverable for reasons within our control, we will re-perform the affected work at no cost or credit it against future work — your choice.",
          ],
        },
        {
          heading: "5. What is not refundable",
          bullets: [
            "Completed sprints, milestones and accepted deliverables.",
            "Third-party costs already incurred on your behalf (hosting, domains, licenses, API/AI usage).",
            "Change requests, new features or rework requested outside the agreed scope.",
          ],
        },
        {
          heading: "6. How to request a refund or cancel",
          paragraphs: [
            "Email business@webcules.com with your company name and invoice number. Approved refunds are issued to the original payment method within 10 business days. Any dispute is handled first by good-faith discussion — we would rather fix the problem than keep your money.",
          ],
        },
        {
          heading: "7. Statutory rights",
          paragraphs: [
            "Nothing in this policy limits consumer rights that cannot be waived under applicable law, including Saskatchewan and Canadian consumer protection legislation.",
          ],
        },
      ]}
    />
  );
}
