/* WEB-247 merge engine — registry resolution from a real project context,
 * per-surface escaping, unknown-field passthrough, and the contract
 * refactor's behavior parity. Uses the real D1 (helpers) like the other
 * "unit" suites in this repo. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { buildMergeValues, CONTRACT_MERGE_FIELDS, MERGE_FIELDS, renderMerge, renderMergeFrom } from "@/lib/merge";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedFullContext() {
  const studio = await seedStudio({ name: "Willow & Pine" });
  const projectId = await seedProject(studio.organizationId, "Golden Hour Wedding");
  const clientId = crypto.randomUUID();
  await getDb().insert(schema.clients).values({
    id: clientId,
    organizationId: studio.organizationId,
    email: "maya@example.com",
    name: "Maya Patel",
    phone: "+1 555 0100",
  });
  const leadId = crypto.randomUUID();
  await getDb().insert(schema.leads).values({
    id: leadId,
    organizationId: studio.organizationId,
    name: "Maya Patel",
    email: "maya@example.com",
    eventType: "Wedding",
  });
  await getDb()
    .update(schema.projects)
    .set({
      clientId,
      leadId,
      eventDate: new Date("2027-06-14T12:00:00Z"),
    })
    .where(eq(schema.projects.id, projectId));
  const invoiceId = crypto.randomUUID();
  await getDb().insert(schema.invoices).values({
    id: invoiceId,
    organizationId: studio.organizationId,
    projectId,
    number: "INV-014",
    totalMinor: 245000,
    currency: "usd",
  });
  return { studio, projectId, invoiceId };
}

describe("buildMergeValues (WEB-247)", () => {
  it("resolves the full registry from a real project context", async () => {
    const { studio, projectId, invoiceId } = await seedFullContext();
    const values = await buildMergeValues({
      organizationId: studio.organizationId,
      projectId,
      invoiceId,
      overrides: { gallery_link: "https://snap.webcules.com/g/abc123", sign_url: "https://snap.webcules.com/c/tok123" },
    });
    expect(values.studio_name).toBe("Willow & Pine");
    expect(values.client_name).toBe("Maya Patel");
    expect(values.client_email).toBe("maya@example.com");
    expect(values.client_phone).toBe("+1 555 0100");
    expect(values.project_title).toBe("Golden Hour Wedding");
    expect(values.package).toBe("Golden Hour Wedding");
    expect(values.event_date).toBe("June 14, 2027");
    expect(values.session_type).toBe("Wedding");
    expect(values.invoice_number).toBe("INV-014");
    expect(values.invoice_total).toBe("$2,450.00");
    expect(values.booking_link).toMatch(new RegExp(`^https?://[^/]+/b/${studio.slug}$`));
    expect(values.portal_link).toMatch(/^https?:\/\/[^/]+\/portal$/);
    expect(values.gallery_link).toBe("https://snap.webcules.com/g/abc123");
    expect(values.sign_url).toBe("https://snap.webcules.com/c/tok123");
    expect(values.studio_email).toBe(`${studio.slug}@test.test`);
    expect(values.today).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });

  it("falls back to contract-era phrases when data is missing", async () => {
    const studio = await seedStudio();
    const projectId = await seedProject(studio.organizationId);
    const values = await buildMergeValues({
      organizationId: studio.organizationId,
      projectId,
      clientEmail: "jo@example.com",
    });
    expect(values.client_name).toBe("jo"); // email-prefix fallback, exactly like contracts
    expect(values.event_date).toBe("the scheduled date");
    expect(values.project_title).toBe("Test Project");
    expect(values.gallery_link).toBe("your gallery (link to follow)");
    expect(values.invoice_number).toBe("");
  });

  it("client_name falls to 'the client' with no email hint", async () => {
    const studio = await seedStudio();
    const values = await buildMergeValues({ organizationId: studio.organizationId });
    expect(values.client_name).toBe("the client");
  });
});

describe("renderMerge (WEB-247)", () => {
  const values = {
    client_name: "Maya <m@example.com>",
    studio_name: "A&B Studio",
    gallery_link: "https://snap.webcules.com/g/abc",
  };

  it("unknown fields pass through untouched", () => {
    const out = renderMerge("Hi {{client_name}} — {{not_a_field}} {{ another_unknown }}", values, { surface: "plain" });
    expect(out).toBe("Hi Maya <m@example.com> — {{not_a_field}} {{ another_unknown }}");
  });

  it("plain/pdf-text surfaces insert values raw (contract behavior)", () => {
    const t = "{{studio_name}} & {{client_name}}";
    expect(renderMerge(t, values, { surface: "plain" })).toBe("A&B Studio & Maya <m@example.com>");
    expect(renderMerge(t, values, { surface: "pdf-text" })).toBe("A&B Studio & Maya <m@example.com>");
  });

  it("html surfaces escape values", () => {
    const out = renderMerge("Hi {{client_name}} at {{studio_name}}", values, { surface: "html-email" });
    expect(out).toBe("Hi Maya &lt;m@example.com&gt; at A&amp;B Studio");
  });

  it("html surfaces auto-link link fields", () => {
    const out = renderMerge("Go: {{gallery_link}}", values, { surface: "html" });
    expect(out).toBe('Go: <a href="https://snap.webcules.com/g/abc" target="_blank" rel="noopener noreferrer">https://snap.webcules.com/g/abc</a>');
  });

  it("link fields with non-URL fallback text are escaped, not linked", () => {
    const out = renderMerge("{{gallery_link}}", { gallery_link: "your gallery (link to follow)" }, { surface: "html-email" });
    expect(out).toBe("your gallery (link to follow)");
  });

  it("field names are case-insensitive", () => {
    expect(renderMerge("{{CLIENT_NAME}}", values, { surface: "plain" })).toBe("Maya <m@example.com>");
  });

  it("registry is complete and picker data is well-formed", () => {
    const ids = MERGE_FIELDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length); // no dupes
    for (const f of MERGE_FIELDS) {
      expect(f.label).toBeTruthy();
      expect(f.description).toBeTruthy();
    }
    expect(CONTRACT_MERGE_FIELDS.map((f) => f.id)).toEqual(["client_name", "studio_name", "date", "event_date", "package"]);
  });
});

describe("contract parity (WEB-247 refactor)", () => {
  it("renders the WEB-158 contract body exactly like the old engine did", async () => {
    const { studio, projectId } = await seedFullContext();
    const out = await renderMergeFrom(
      { organizationId: studio.organizationId, projectId, clientEmail: "maya@example.com" },
      "{{studio_name}} × {{client_name}} × {{date}} × {{event_date}} × {{package}}",
      { surface: "plain" },
    );
    expect(out).toBe("Willow & Pine × Maya Patel × " + new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) + " × June 14, 2027 × Golden Hour Wedding");
  });
});
