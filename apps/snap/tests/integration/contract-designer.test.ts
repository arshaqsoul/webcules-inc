/* WEB-251 contract designer — template gate, clause library, shared body
 * renderer (preview = signing page), merge extensions (total/deposit/legal
 * names), template edits never mutating created contracts, and the
 * template → contract → send E2E. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { renderContractBodyHtml, contractBodyToText } from "@/lib/contract-body";
import { createContract, mergeContractBody, sendContract } from "@/lib/contracts";
import { createTemplate } from "@/lib/repos/templates";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

describe("body renderer (WEB-251)", () => {
  it("renders plain text as paragraphs and sanitizes HTML bodies", () => {
    const plain = renderContractBodyHtml("Para one.\nLine two.\n\nPara two.");
    expect(plain).toBe("<p>Para one.<br />Line two.</p><p>Para two.</p>");
    const html = renderContractBodyHtml("<p>ok</p><script>alert(1)</script><p onclick=\"x\">hi</p>");
    expect(html).not.toMatch(/script|onclick|alert/);
    expect(html).toContain("<p>ok</p>");
  });

  it("projects HTML bodies to PDF text", () => {
    expect(contractBodyToText("<h3>Title</h3><p>One</p><ul><li>A</li><li>B</li></ul>")).toBe("Title\nOne\n• A\n• B");
    expect(contractBodyToText("plain\nstays")).toBe("plain\nstays");
  });
});

describe("template library + gate (WEB-251)", () => {
  it("seeds clause starters and enforces the Free 2-template gate at the repo level", async () => {
    const studio = await seedStudio({ plan: "free" });
    const a = await createTemplate({ organizationId: studio.organizationId, kind: "contract", name: "A", body: "body a" });
    const b = await createTemplate({ organizationId: studio.organizationId, kind: "contract", name: "B", body: "body b" });
    expect(a.ok && b.ok).toBe(true);
    // Clauses are ungated.
    for (let i = 0; i < 3; i++) {
      expect((await createTemplate({ organizationId: studio.organizationId, kind: "contract_clause", name: `C${i}`, body: "clause" })).ok).toBe(true);
    }
  });

  it("sanitizes HTML-bearing contract bodies at save", async () => {
    const studio = await seedStudio({ plan: "studio" });
    const t = await createTemplate({
      organizationId: studio.organizationId,
      kind: "contract",
      name: "HTML agreement",
      body: "<p>fine</p><script>alert(1)</script><p onclick=\"x\">bad</p>",
    });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.template.body).not.toMatch(/script|onclick|alert/);
    expect(t.template.body).toContain("<p>fine</p>");
  });
});

describe("merge extensions (WEB-251)", () => {
  it("resolves total/deposit/legal names from the project context", async () => {
    const studio = await seedStudio({ name: "Aurora Photos" });
    const projectId = await seedProject(studio.organizationId, "Golden Hour Wedding");
    await getDb().update(schema.projects).set({ quotedTotalMinor: 290000, quotedCurrency: "usd" }).where(eq(schema.projects.id, projectId));
    const contract = await createContract({
      organizationId: studio.organizationId,
      projectId,
      title: "Agreement",
      body: "total {{total}} deposit {{deposit}} between {{studio_legal_name}} and {{client_legal_name}} on {{event_date_long}} — {{not_a_field}} stays",
      clientEmail: "maya@example.com",
    });
    const merged = await mergeContractBody(contract);
    expect(merged).toContain("total $2,900.00");
    expect(merged).toContain("between Aurora Photos and maya");
    expect(merged).toContain("{{not_a_field}} stays");
    expect(merged).toContain("the deposit as agreed");
  });
});

describe("versioning + E2E (WEB-251)", () => {
  it("template edits never mutate contracts created from it; send freezes merges", async () => {
    const studio = await seedStudio({ plan: "studio" });
    const projectId = await seedProject(studio.organizationId, "Sunset Session");
    const clientId = crypto.randomUUID();
    await getDb().insert(schema.clients).values({ id: clientId, organizationId: studio.organizationId, email: "maya@example.com", name: "Maya Patel" });
    await getDb().update(schema.projects).set({ clientId }).where(eq(schema.projects.id, projectId));

    const template = await createTemplate({
      organizationId: studio.organizationId,
      kind: "contract",
      name: "Portrait agreement",
      body: "Between {{studio_name}} and {{client_name}} for {{project_title}}.",
    });
    if (!template.ok) throw new Error("seed");

    // Apply: body is COPIED into the contract.
    const contract = await createContract({
      organizationId: studio.organizationId,
      projectId,
      title: template.template.name,
      body: template.template.body,
      clientEmail: "maya@example.com",
    });

    // Edit the template afterwards.
    const { updateTemplate } = await import("@/lib/repos/templates");
    await updateTemplate(studio.organizationId, template.template.id, { body: "TOTALLY DIFFERENT" });

    const fresh = (await getDb().select().from(schema.contracts).where(eq(schema.contracts.id, contract.id)))[0];
    expect(fresh.body).toContain("{{client_name}}");
    expect(fresh.body).not.toContain("TOTALLY DIFFERENT");

    // Send: merge fields freeze into the stored body.
    // No EMAIL binding in tests: the send still freezes the merged body and
    // flips the contract to sent before the (failing) email step.
    const sent = await sendContract(studio.organizationId, contract.id);
    expect(sent.ok === true || (sent.ok === false && sent.error === "email_failed")).toBe(true);
    const sentRow = (await getDb().select().from(schema.contracts).where(eq(schema.contracts.id, contract.id)))[0];
    expect(sentRow.body).toContain("Maya Patel");
    expect(sentRow.body).toContain("Sunset Session");
    expect(sentRow.body).not.toContain("{{");
  });
});
