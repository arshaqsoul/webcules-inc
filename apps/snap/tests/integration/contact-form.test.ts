/* WEB-249 contact-form designer — widget parity with the pre-designer
 * form, multi-form rendering, merge fields in copy, lead source naming,
 * the no-template fallback, and the widget bundle budget. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { GET as contactRoute } from "@/app/embed/contact/route";
import { POST as embedFormSubmit } from "@/app/api/embed/forms/[templateId]/route";
import { POST as legacyLeads } from "@/app/api/embed/leads/route";
import { getDb, schema } from "@/lib/db";
import { DEFAULT_CONTACT_FORM_BODY } from "@/lib/forms";
import { createTemplate } from "@/lib/repos/templates";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedDefaultForm(orgId: string) {
  const created = await createTemplate({ organizationId: orgId, kind: "form", name: "General intake", body: DEFAULT_CONTACT_FORM_BODY, isDefault: true });
  if (!created.ok) throw new Error("seed default form");
  return created.template;
}

describe("default widget parity (WEB-249)", () => {
  it("renders the seeded intake with the pre-designer fields, options and copy", async () => {
    const studio = await seedStudio({ name: "Parity Studio" });
    await seedDefaultForm(studio.organizationId);
    const res = await contactRoute(new Request(`https://snap.test/embed/contact?key=${studio.embedKey}`));
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const marker of [
      "Get in touch",
      "Tell us about your shoot — we usually reply within a day.",
      'name="data-f_name"',
      'name="data-f_email"',
      'name="data-f_phone"',
      'name="data-f_eventDate"',
      'name="data-f_eventType"',
      "Wedding",
      "Engagement",
      "Commercial",
      "Other",
      'name="data-f_message"',
      "Send inquiry",
      "Thank you — your inquiry is in!",
      "company_website",
      "snap:height",
    ]) {
      expect(html).toContain(marker);
    }
    // Bundle budget: one static doc, comfortably small.
    expect(html.length).toBeLessThan(20000);
  });

  it("falls back to the canonical form when the studio has no template (legacy parity)", async () => {
    const studio = await seedStudio();
    const res = await contactRoute(new Request(`https://snap.test/embed/contact?key=${studio.embedKey}`));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="data-f_eventType"');
    expect(html).toContain("/api/embed/leads?key=");
  });

  it("legacy leads endpoint accepts the f_* convention (fallback submissions)", async () => {
    const studio = await seedStudio();
    const res = await legacyLeads(
      new Request(`https://snap.test/api/embed/leads?key=${studio.embedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ f_name: "Legacy Visitor", f_email: "legacy@example.com", f_eventType: "Wedding", turnstileToken: "" }),
      }),
    );
    expect(res.status).toBe(200);
    const [lead] = await getDb().select().from(schema.leads).limit(1);
    expect(lead.name).toBe("Legacy Visitor");
    expect(lead.eventType).toBe("Wedding");
  });
});

describe("multi-form + copy (WEB-249)", () => {
  it("?form= renders a distinct schema, submit records the form name as lead source", async () => {
    const studio = await seedStudio({ name: "Multi Studio" });
    const def = await seedDefaultForm(studio.organizationId);
    const bridal = await createTemplate({
      organizationId: studio.organizationId,
      kind: "form",
      name: "Bridal fair QR",
      body: JSON.stringify({
        v: 1,
        title: "Win a free shoot",
        fields: [
          { id: "f_name", kind: "text", label: "Name", required: true },
          { id: "f_email", kind: "email", label: "Email", required: true },
          { id: "f_ig", kind: "text", label: "Your Instagram", required: false },
        ],
      }),
    });
    if (!bridal.ok) throw new Error("seed bridal");

    const page = await contactRoute(new Request(`https://snap.test/embed/contact?key=${studio.embedKey}&form=${bridal.template.id}`));
    const html = await page.text();
    expect(html).toContain("Win a free shoot");
    expect(html).toContain("Your Instagram");
    expect(html).not.toContain("What kind of shoot?");
    expect(html).toContain(`/api/embed/forms/${bridal.template.id}?key=`);

    const res = await embedFormSubmit(
      new Request(`https://snap.test/api/embed/forms/${bridal.template.id}?key=${studio.embedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ f_name: "Fair Visitor", f_email: "fair@example.com", f_ig: "@fair.visitor" }),
      }),
      { params: Promise.resolve({ templateId: bridal.template.id }) },
    );
    expect(res.status).toBe(200);
    const [lead] = await getDb().select().from(schema.leads).limit(1);
    expect(lead.source).toBe("Bridal fair QR");
    expect(JSON.parse(lead.customFields!)).toEqual({ f_ig: { label: "Your Instagram", value: "@fair.visitor" } });
    void def;
  });

  it("merge fields resolve in heading/intro/thank-you", async () => {
    const studio = await seedStudio({ name: "Aurora Photos" });
    await createTemplate({
      organizationId: studio.organizationId,
      kind: "form",
      name: "Merged form",
      isDefault: true,
      body: JSON.stringify({
        v: 1,
        title: "Book {{studio_name}}",
        intro: "Photos by {{studio_name}} — we reply fast.",
        thankYou: "{{studio_name}} got it!",
        fields: [
          { id: "f_name", kind: "text", label: "Name", required: true },
          { id: "f_email", kind: "email", label: "Email", required: true },
        ],
      }),
    });
    const res = await contactRoute(new Request(`https://snap.test/embed/contact?key=${studio.embedKey}`));
    const html = await res.text();
    expect(html).toContain("Book Aurora Photos");
    expect(html).toContain("Photos by Aurora Photos");
    expect(html).toContain("Aurora Photos got it!");
  });

  it("custom fields flow into the lead with labels preserved", async () => {
    const studio = await seedStudio({ plan: "studio" });
    await createTemplate({
      organizationId: studio.organizationId,
      kind: "form",
      name: "Custom Qs",
      isDefault: true,
      body: JSON.stringify({
        v: 1,
        fields: [
          { id: "f_name", kind: "text", label: "Name", required: true },
          { id: "f_email", kind: "email", label: "Email", required: true },
          { id: "f_dogs", kind: "select", label: "How many dogs?", required: false, options: ["1", "2", "3+"] },
        ],
      }),
    });
    const res = await embedFormSubmit(
      new Request(`https://snap.test/api/embed/forms/${(await getDb().select({ id: schema.templates.id }).from(schema.templates).where(eq(schema.templates.organizationId, studio.organizationId)).limit(1))[0].id}?key=${studio.embedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ f_name: "Dog Person", f_email: "dogs@example.com", f_dogs: "3+" }),
      }),
      { params: Promise.resolve({ templateId: (await getDb().select({ id: schema.templates.id }).from(schema.templates).where(eq(schema.templates.organizationId, studio.organizationId)).limit(1))[0].id }) },
    );
    expect(res.status).toBe(200);
    const [lead] = await getDb().select().from(schema.leads).limit(1);
    expect(JSON.parse(lead.customFields!)).toEqual({ f_dogs: { label: "How many dogs?", value: "3+" } });
  });
});
