/* WEB-248 integration — the full round trips over real D1/R2: embeddable
 * form → lead with custom_fields; questionnaire token link → public page →
 * submit → stored answers; public file presign + HMAC verification; rate
 * limits. Turnstile is unenforced without a secret (test env). */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { GET as embedFormRoute } from "@/app/embed/contact/route";
import { POST as embedFormSubmit } from "@/app/api/embed/forms/[templateId]/route";
import { POST as embedFilePresign } from "@/app/api/embed/forms/[templateId]/file/route";
import { GET as questionnairePage } from "@/app/q/[token]/route";
import { POST as questionnaireSubmit } from "@/app/api/forms/q/[token]/route";
import { POST as questionnaireFilePresign } from "@/app/api/forms/q/[token]/file/route";
import { getDb, schema } from "@/lib/db";
import { createFormResponse, getFormResponseByToken, presignFormFile, verifyFormFileKey } from "@/lib/repos/forms";
import { createTemplate } from "@/lib/repos/templates";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

const FORM_BODY = JSON.stringify({
  v: 1,
  title: "Get in touch",
  fields: [
    { id: "f_name", kind: "text", label: "Name", required: true, half: true },
    { id: "f_email", kind: "email", label: "Email", required: true, half: true },
    { id: "f_venue", kind: "text", label: "Venue", required: false },
  ],
});

async function seedFormTemplate(orgId: string) {
  const created = await createTemplate({ organizationId: orgId, kind: "form", name: "Inquiry form", body: FORM_BODY, isDefault: true });
  if (!created.ok) throw new Error("seed template");
  return created.template;
}

describe("embeddable form round trip (WEB-248)", () => {
  it("renders the public form and stores a lead with custom answers", async () => {
    const studio = await seedStudio({ name: "Willow & Pine" });
    const template = await seedFormTemplate(studio.organizationId);

    const page = await embedFormRoute(new Request(`https://snap.test/embed/contact?key=${studio.embedKey}`));
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('name="data-f_name"');
    expect(html).toContain("Venue");
    expect(html).toContain("company_website"); // honeypot present

    const res = await embedFormSubmit(
      new Request(`https://snap.test/api/embed/forms/${template.id}?key=${studio.embedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ f_name: "Maya Patel", f_email: "Maya@Example.com", f_venue: "The Barn", turnstileToken: "" }),
      }),
      { params: Promise.resolve({ templateId: template.id }) },
    );
    expect(res.status).toBe(200);

    const [lead] = await getDb().select().from(schema.leads).where(eq(schema.leads.organizationId, studio.organizationId)).limit(1);
    expect(lead).toBeTruthy();
    expect(lead!.name).toBe("Maya Patel");
    expect(lead!.email).toBe("maya@example.com");
    expect(JSON.parse(lead!.customFields!)).toEqual({ f_venue: { label: "Venue", value: "The Barn" } });
  });

  it("validates against the STORED schema — posted extras and spoofed options ignored", async () => {
    const studio = await seedStudio();
    const template = await seedFormTemplate(studio.organizationId);
    const res = await embedFormSubmit(
      new Request(`https://snap.test/api/embed/forms/${template.id}?key=${studio.embedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ f_name: "", f_email: "not-an-email", fields: [{ id: "f_x", kind: "text" }] }),
      }),
      { params: Promise.resolve({ templateId: template.id }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_answers");
    const leads = await getDb().select().from(schema.leads);
    expect(leads.length).toBe(0);
  });

  it("404s on a bad embed key and dedupes open leads by email", async () => {
    const studio = await seedStudio();
    const template = await seedFormTemplate(studio.organizationId);
    const bad = await embedFormSubmit(
      new Request(`https://snap.test/api/embed/forms/${template.id}?key=deadbeefdeadbeef`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ f_name: "A", f_email: "a@b.co" }),
      }),
      { params: Promise.resolve({ templateId: template.id }) },
    );
    expect(bad.status).toBe(404);

    for (let i = 0; i < 2; i++) {
      await embedFormSubmit(
        new Request(`https://snap.test/api/embed/forms/${template.id}?key=${studio.embedKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ f_name: `Maya ${i}`, f_email: "maya@example.com" }),
        }),
        { params: Promise.resolve({ templateId: template.id }) },
      );
    }
    const leads = await getDb().select().from(schema.leads);
    expect(leads.length).toBe(1);
    expect(leads[0].name).toBe("Maya 1");
  });
});

describe("questionnaire round trip (WEB-248)", () => {
  it("token link → public page → submit → answers on the project", async () => {
    const studio = await seedStudio();
    const projectId = await seedProject(studio.organizationId, "Golden Hour Wedding");
    const created = await createTemplate({
      organizationId: studio.organizationId,
      kind: "questionnaire",
      name: "Client questionnaire",
      body: JSON.stringify({
        v: 1,
        fields: [
          { id: "f_name", kind: "text", label: "Your name", required: true },
          { id: "f_venue", kind: "text", label: "Venue", required: false },
        ],
      }),
    });
    if (!created.ok) throw new Error("seed");

    const link = await createFormResponse({ organizationId: studio.organizationId, projectId, templateId: created.template.id, clientEmail: "maya@example.com" });
    expect(link.token.length).toBeGreaterThanOrEqual(20);

    const page = await questionnairePage(new Request(`https://snap.test/q/${link.token}`), { params: Promise.resolve({ token: link.token }) });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Venue");

    const res = await questionnaireSubmit(
      new Request(`https://snap.test/api/forms/q/${link.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ f_name: "Maya Patel", f_venue: "The Barn" }),
      }),
      { params: Promise.resolve({ token: link.token }) },
    );
    expect(res.status).toBe(200);

    const stored = await getFormResponseByToken(link.token);
    expect(stored!.submittedAt).not.toBeNull();
    expect(JSON.parse(stored!.answers!)).toEqual({ answers: { f_name: "Maya Patel", f_venue: "The Barn" }, files: {} });

    // Second submit is refused; the page shows the thank-you state.
    const again = await questionnaireSubmit(
      new Request(`https://snap.test/api/forms/q/${link.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ f_name: "Again" }),
      }),
      { params: Promise.resolve({ token: link.token }) },
    );
    expect(again.status).toBe(409);
    const done = await questionnairePage(new Request(`https://snap.test/q/${link.token}`), { params: Promise.resolve({ token: link.token }) });
    expect(await done.text()).toContain("Thank you");

    // Audit trail recorded.
    const [audit] = await getDb()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "questionnaire.submitted"))
      .limit(1);
    expect(audit.targetId).toBe(projectId);
  });

  it("honeypot pretends success and bad tokens 404", async () => {
    const studio = await seedStudio();
    void studio;
    const honeypot = await questionnaireSubmit(
      new Request("https://snap.test/q/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_website: "https://bot.example" }),
      }),
      { params: Promise.resolve({ token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }) },
    );
    expect(honeypot.status).toBe(200);
    const notFound = await questionnaireSubmit(
      new Request("https://snap.test/q/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }) },
    );
    expect(notFound.status).toBe(404);
  });
});

describe("public file presigns (WEB-248)", () => {
  it("mints HMAC-bound keys, verifies them, and rejects size/name abuse", async () => {
    const studio = await seedStudio();
    const ok = await presignFormFile({ organizationId: studio.organizationId, filename: "moodboard (final).png", bytes: 1024, mimeType: "image/png", maxBytes: 20 * 1024 * 1024 });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.key.startsWith(`${studio.organizationId}/form-files/`)).toBe(true);
    expect(await verifyFormFileKey(studio.organizationId, ok.key, ok.token)).toBe(true);
    expect(await verifyFormFileKey(studio.organizationId, ok.key, "forged")).toBe(false);
    // Cross-org key rejected.
    const other = await seedStudio();
    expect(await verifyFormFileKey(other.organizationId, ok.key, ok.token)).toBe(false);

    expect((await presignFormFile({ organizationId: studio.organizationId, filename: "x.png", bytes: 21 * 1024 * 1024, mimeType: "image/png", maxBytes: 20 * 1024 * 1024 })).ok).toBe(false);
    expect((await presignFormFile({ organizationId: studio.organizationId, filename: "../etc/passwd", bytes: 5, mimeType: "text/plain", maxBytes: 100 })).ok).toBe(false);
  });

  it("questionnaire file presign route enforces the response token + rate limit", async () => {
    const studio = await seedStudio();
    const projectId = await seedProject(studio.organizationId);
    const template = await createTemplate({ organizationId: studio.organizationId, kind: "questionnaire", name: "Q", body: FORM_BODY });
    if (!template.ok) throw new Error("seed");
    const link = await createFormResponse({ organizationId: studio.organizationId, projectId, templateId: template.template.id });

    const good = await questionnaireFilePresign(
      new Request("https://snap.test/api/forms/q/t/file", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.10" },
        body: JSON.stringify({ filename: "ref.png", bytes: 10, mimeType: "image/png" }),
      }),
      { params: Promise.resolve({ token: link.token }) },
    );
    expect(good.status).toBe(200);
    const goodBody = (await good.json()) as { url: string; key: string; token: string };
    expect(goodBody.url).toContain("X-Amz-Signature");

    const badToken = await questionnaireFilePresign(
      new Request("https://snap.test/api/forms/q/t/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "ref.png", bytes: 10 }),
      }),
      { params: Promise.resolve({ token: "cccccccccccccccccccccccccccccccccccccccc" }) },
    );
    expect(badToken.status).toBe(404);

    // Rate limit: 30 presigns/min on one IP.
    let last = 200;
    for (let i = 0; i < 35; i++) {
      last = (
        await questionnaireFilePresign(
          new Request("https://snap.test/api/forms/q/t/file", {
            method: "POST",
            headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.7" },
            body: JSON.stringify({ filename: "ref.png", bytes: 10 }),
          }),
          { params: Promise.resolve({ token: link.token }) },
        )
      ).status;
    }
    expect(last).toBe(429);
  });

  it("embed file presign route checks the embed key", async () => {
    const studio = await seedStudio();
    const template = await seedFormTemplate(studio.organizationId);
    const res = await embedFilePresign(
      new Request(`https://snap.test/api/embed/forms/${template.id}/file?key=${studio.embedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "ref.png", bytes: 10 }),
      }),
      { params: Promise.resolve({ templateId: template.id }) },
    );
    expect(res.status).toBe(200);
    const bad = await embedFilePresign(
      new Request(`https://snap.test/api/embed/forms/${template.id}/key=ffffffffffffffff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "ref.png", bytes: 10 }),
      }),
      { params: Promise.resolve({ templateId: template.id }) },
    );
    expect(bad.status).toBe(404);
  });
});
