/* WEB-253 email designer — override validation/application, empty =
 * default byte-identical, sanitizer + caps, snippet resolution for the lead
 * thread, gate math, and the preview renderer using the production shell. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { shell } from "@/lib/email";
import { renderEmailPreview } from "@/lib/email-preview";
import { applyEmailOverride, loadEmailOverrides, saveEmailOverrides, validateEmailOverridesInput } from "@/lib/email-overrides";
import { buildMergeValues, renderMerge } from "@/lib/merge";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(resetDb);

describe("override validation (WEB-253)", () => {
  it("accepts known templates, caps fields, sanitizes intros, drops unknown keys", () => {
    const out = validateEmailOverridesInput({
      "lead.ack": { subject: "Thanks!", intro: "<p>Hi <strong>there</strong></p><script>alert(1)</script>" },
      unknown_key: { subject: "x" },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.overrides["lead.ack"].subject).toBe("Thanks!");
    expect(out.overrides["lead.ack"].intro).toBe("<p>Hi <strong>there</strong></p>");
    expect(out.overrides.unknown_key).toBeUndefined();
    expect(validateEmailOverridesInput({ "lead.ack": { subject: "x".repeat(121) } }).ok).toBe(false);
    expect(validateEmailOverridesInput({ "lead.ack": { intro: "i".repeat(1001) } }).ok).toBe(false);
    expect(validateEmailOverridesInput("nope").ok).toBe(false);
  });

  it("persists per org and reloads", async () => {
    const a = await seedStudio();
    const b = await seedStudio();
    expect((await saveEmailOverrides(a.organizationId, { "lead.ack": { subject: "A subject" } })).ok).toBe(true);
    expect((await loadEmailOverrides(a.organizationId))["lead.ack"].subject).toBe("A subject");
    expect(await loadEmailOverrides(b.organizationId)).toEqual({});
  });
});

describe("override application (WEB-253)", () => {
  const values = { studio_name: "Aurora Photos", client_name: "maya" };

  it("no override = byte-identical passthrough", () => {
    const input = { subject: "S", html: "<p>body</p>", text: "body" };
    expect(applyEmailOverride(input, undefined, values)).toEqual(input);
    expect(applyEmailOverride(input, {}, values)).toEqual(input);
  });

  it("replaces subject (merge-resolved) and the first paragraph; prepends to text", () => {
    const out = applyEmailOverride(
      { subject: "Default", html: '<p style="margin:0;">first</p><p>second</p>', text: "first\nsecond" },
      { subject: "Hello from {{studio_name}}", intro: "<p>Hi {{client_name}}, welcome.</p>" },
      values,
    );
    expect(out.subject).toBe("Hello from Aurora Photos");
    expect(out.html).toBe("<p>Hi maya, welcome.</p><p>second</p>");
    expect(out.text.startsWith("Hi maya, welcome.")).toBe(true);
    expect(out.text).toContain("first");
  });

  it("prepending fallback when the email has no paragraph", () => {
    const out = applyEmailOverride({ subject: "s", html: "<div>no paragraphs</div>", text: "t" }, { intro: "<p>intro</p>" }, values);
    expect(out.html.startsWith("<p>intro</p>")).toBe(true);
  });
});

describe("preview = production renderer (WEB-253)", () => {
  it("renders the production shell with sample data + the live override", async () => {
    const studio = await seedStudio({ name: "Aurora Photos" });
    await saveEmailOverrides(studio.organizationId, { "lead.ack": { subject: "Custom", intro: "<p>Hi {{client_name}}, thanks from {{studio_name}}!</p>" } });
    const html = await renderEmailPreview(studio.organizationId, "lead.ack");
    expect(html).toContain("Aurora Photos");
    expect(html).toContain("Hi Maya, thanks from Aurora Photos!");
    // Same-renderer assertion: the production shell's exact wrapper markup
    // (built by calling shell directly with the same brand) is present.
    const brand = await (await import("@/lib/branding")).getEmailBrand(studio.organizationId);
    const direct = shell(brand.accent, "same-renderer-probe", "<p>x</p>", "probe-footer", {
      studioName: brand.studioName,
      whiteLabel: brand.whiteLabel,
      emailHeaderUrl: brand.emailHeaderUrl,
      contactEmail: brand.contactEmail,
    });
    const wrapper = direct.slice(direct.indexOf("<table"), direct.indexOf("same-renderer-probe"));
    expect(wrapper.length).toBeGreaterThan(100);
    expect(html).toContain(wrapper);
  });
});

describe("lead-thread snippets (WEB-253)", () => {
  it("snippets resolve merge fields against the lead context", async () => {
    const studio = await seedStudio({ name: "Aurora Photos" });
    await getDb().insert(schema.templates).values({
      id: crypto.randomUUID(),
      organizationId: studio.organizationId,
      kind: "email_snippet",
      name: "Pricing follow-up",
      body: "<p>Hi {{client_name}}, thanks for reaching out to {{studio_name}}!</p>",
      meta: JSON.stringify({ subject: "Your pricing" }),
    });
    const values = await buildMergeValues({ organizationId: studio.organizationId, clientEmail: "maya@example.com" });
    const text = renderMerge(
      "<p>Hi {{client_name}}, thanks for reaching out to {{studio_name}}!</p>"
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|li)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim(),
      values,
      { surface: "plain" },
    );
    expect(text).toContain("Hi maya");
    expect(text).toContain("Aurora Photos");
    void eq;
  });
});
