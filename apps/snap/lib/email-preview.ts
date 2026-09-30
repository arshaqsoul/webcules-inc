/* Email preview (WEB-253) — renders the PRODUCTION shell with sample data
 * plus the studio's live override, so the Settings preview can never drift
 * from what clients receive. Used by the preview endpoint and asserted
 * same-function in tests. */
import { shell } from "./email";
import { getEmailBrand } from "./branding";
import { applyEmailOverride, loadEmailOverrides } from "./email-overrides";
import { buildMergeValues } from "./merge";

const SAMPLE_INTROS: Record<string, string> = {
  "lead.ack": "Your inquiry to <strong>{{studio_name}}</strong> is in. They typically reply within a day — keep an eye on your inbox.",
  "lead.form_ack": "Your inquiry to <strong>{{studio_name}}</strong> is in. They typically reply within a day — keep an eye on your inbox.",
  "booking.confirmed_client": "Your booking is confirmed — the details are below, and a calendar invite is attached.",
  "booking.canceled_client": "Your booking has been canceled. If this is unexpected, just reply to this email.",
  "booking.rescheduled_client": "Your booking has been moved to a new time — the details are below, and your payment carries over.",
  "booking.reminder_client": "Your session is coming up — the details are below, and you can manage your booking any time.",
  "booking.refund_client": "Your refund has been issued — it typically lands within 5–10 business days.",
  gallery_link: "Your photos are ready! The private gallery below stays open for 90 days.",
  "invoice.sent": "Your invoice is ready — you can review and pay securely from the link below.",
  "contract.sign_request": "Your agreement is ready to sign — it takes less than a minute.",
  "contract.signed": "Signed, sealed, delivered — your countersigned copy is below.",
  "portal.login_code": "Use the code below to sign in to your client portal.",
  "questionnaire.link": "A few quick questions below — your answers help the studio prepare.",
  "questionnaire.ack": "Thank you! Your answers are safely with the studio.",
};

const SAMPLE_TITLES: Record<string, string> = {
  "lead.ack": "Thanks, Maya!",
  "lead.form_ack": "Thanks, Maya!",
  "booking.confirmed_client": "You're booked!",
  "booking.canceled_client": "Booking canceled",
  "booking.rescheduled_client": "Your new session time",
  "booking.reminder_client": "Your session is coming up",
  "booking.refund_client": "Refund issued",
  gallery_link: "Your gallery is ready",
  "invoice.sent": "Invoice from {{studio}}",
  "contract.sign_request": "Time to sign",
  "contract.signed": "All signed!",
  "portal.login_code": "Your sign-in code",
  "questionnaire.link": "A few questions",
  "questionnaire.ack": "Thank you!",
};

/** The production shell with sample client data + the studio's override. */
export async function renderEmailPreview(organizationId: string, templateKey: string): Promise<string> {
  const brand = await getEmailBrand(organizationId);
  const overrides = await loadEmailOverrides(organizationId);
  const override = overrides[templateKey];
  const values = await buildMergeValues({ organizationId, clientEmail: "maya@example.com" });
  const sample = { ...values, client_name: "Maya", gallery_link: "https://snap.webcules.com/g/sample" };
  const applied = applyEmailOverride(
    {
      subject: "Sample subject",
      html: `<p style="margin:0 0 16px;">${SAMPLE_INTROS[templateKey] ?? "Sample intro paragraph."}</p><p style="margin:0;"><a href="#" style="color:${brand.accent};">Open in your browser →</a></p>`,
      text: "Sample intro paragraph.",
    },
    override,
    sample,
  );
  const title = (SAMPLE_TITLES[templateKey] ?? "Preview").replace("{{studio}}", brand.studioName);
  return shell(brand.accent, title, applied.html, `Preview of your ${templateKey} email — production renderer, sample data.`, {
    studioName: brand.studioName,
    whiteLabel: brand.whiteLabel,
    emailHeaderUrl: brand.emailHeaderUrl,
    contactEmail: brand.contactEmail,
  });
}
