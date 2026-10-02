/* Setup Guide engine (WEB-269) — derives the eleven-item first-time
 * configuration checklist from EXISTING signals only (no new writes where a
 * signal exists). Item state is always derived — nothing can drift; the only
 * persisted setup state is dismiss/reopen on the studio profile. Also owns
 * the demo-gallery action (sample images → real project → real grant → the
 * real gallery email) and the daily-cron activation rollup. */
import { and, eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { countActiveSessionTypes } from "./session-types";
import { getGrantToken } from "@/lib/shares/grants";
import { putObject } from "@/lib/storage/service";

export type SetupStepId =
  | "profile"
  | "brand"
  | "gallery_template"
  | "payouts"
  | "availability"
  | "session_type"
  | "contact_form"
  | "embed"
  | "branding_domain"
  | "contract"
  | "demo_gallery";

export type SetupStep = {
  id: SetupStepId;
  title: string;
  why: string;
  /** Deep link to the surface that completes it (demo_gallery is an action). */
  href: string | null;
  done: boolean;
};

export type SetupState = {
  steps: SetupStep[];
  done: number;
  total: number;
  dismissed: boolean;
};

/** Static checklist metadata, in order. Copy is benefits-first, no jargon. */
export const SETUP_STEPS: Array<Omit<SetupStep, "done">> = [
  { id: "profile", title: "Studio profile", why: "Your name, timezone, and where inquiries land.", href: "/dashboard/settings/general" },
  { id: "brand", title: "Your brand", why: "Logo and accent color across every email and gallery.", href: "/dashboard/settings/brand" },
  // WEB-317/320: the template step — the natural 2.5, free and instant.
  { id: "gallery_template", title: "Pick a gallery template", why: "Ten designer looks for your client galleries — one click, free.", href: "/dashboard/projects" },
  { id: "payouts", title: "Connect payouts", why: "Deposits and invoices land in your bank.", href: "/dashboard/settings/payouts" },
  { id: "availability", title: "Set your availability", why: "Clients book while you sleep.", href: "/dashboard/calendar?tab=availability" },
  { id: "session_type", title: "Define a session type", why: "What clients can book — length, price, deposit.", href: "/dashboard/templates/session-types" },
  { id: "contact_form", title: "Design your contact form", why: "The questions you ask before you say yes.", href: "/dashboard/templates/forms" },
  { id: "embed", title: "Put Snap on your website", why: "Copy a snippet — bookings and inquiries flow in.", href: "/dashboard/settings/embeds" },
  { id: "branding_domain", title: "Make it fully yours", why: "Your own domain and branding (paid plans).", href: "/dashboard/settings/domains" },
  { id: "contract", title: "A contract ready to send", why: "Agreements clients sign in minutes.", href: "/dashboard/templates/contracts" },
  { id: "demo_gallery", title: "See it as your client", why: "Send yourself a demo gallery — the full journey.", href: null },
];

/** "Modified from seed", concretely: a starter template row is born with
 * updated_at === created_at and is inserted in the same breath as the studio
 * profile; any later edit bumps updated_at, and anything created more than a
 * minute after the profile exists is studio-authored. */
function templateTouched(rows: { createdAt: Date; updatedAt: Date }[], profileCreatedAt: Date): boolean {
  return rows.some((r) => r.updatedAt.getTime() > r.createdAt.getTime() || r.createdAt.getTime() > profileCreatedAt.getTime() + 60_000);
}

/** The checklist for one studio — all signals in parallel. */
export async function getSetupState(organizationId: string): Promise<SetupState> {
  const db = getDb();

  const profileRow = (
    await db.select().from(schema.studioProfiles).where(eq(schema.studioProfiles.organizationId, organizationId)).limit(1)
  )[0];
  if (!profileRow) {
    return { steps: SETUP_STEPS.map((s) => ({ ...s, done: false })), done: 0, total: SETUP_STEPS.length, dismissed: false };
  }

  const [
    rules,
    types,
    forms,
    contractsTemplates,
    contractsCount,
    embedOriginsRaw,
    snippetCopied,
    domainsCount,
    templateApplied,
    demo,
  ] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.availabilityRules)
      .where(and(eq(schema.availabilityRules.organizationId, organizationId), eq(schema.availabilityRules.active, true))),
    countActiveSessionTypes(organizationId),
    db
      .select({ createdAt: schema.templates.createdAt, updatedAt: schema.templates.updatedAt })
      .from(schema.templates)
      .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.kind, "form"), sql`archived_at IS NULL`)),
    db
      .select({ createdAt: schema.templates.createdAt, updatedAt: schema.templates.updatedAt })
      .from(schema.templates)
      .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.kind, "contract"), sql`archived_at IS NULL`)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.contracts)
      .where(eq(schema.contracts.organizationId, organizationId)),
    db
      .select({ origins: schema.studioProfiles.embedOrigins })
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, organizationId))
      .limit(1),
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.organizationId, organizationId), eq(schema.auditLog.action, "studio.embed_snippet_copied"))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.customDomains)
      .where(and(eq(schema.customDomains.organizationId, organizationId), sql`removed_at IS NULL`)),
    // WEB-320: any project carrying a seed-template design completes the step.
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.projects)
      .where(and(eq(schema.projects.organizationId, organizationId), sql`gallery_design LIKE '%"template"%'`)),
    // Demo counts when the gallery was actually OPENED: a view access log on
    // a grant for the demo project.
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.shareAccessLogs)
      .innerJoin(schema.shareGrants, eq(schema.shareGrants.id, schema.shareAccessLogs.grantId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.shareGrants.projectId))
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          eq(schema.projects.demo, 1),
          eq(schema.shareAccessLogs.event, "view"),
        ),
      ),
  ]);

  let embedOrigins: string[] = [];
  try {
    embedOrigins = JSON.parse(embedOriginsRaw[0]?.origins ?? "[]") as string[];
  } catch {
    /* malformed column — treat as empty */
  }
  const brand = (() => {
    try {
      return JSON.parse(profileRow.brand || "{}") as { removeBranding?: boolean };
    } catch {
      return {};
    }
  })();

  const doneMap: Record<SetupStepId, boolean> = {
    profile: Boolean(profileRow.studioName),
    brand: Boolean(profileRow.logoKey),
    gallery_template: Number(templateApplied[0]?.n ?? 0) > 0,
    payouts: Boolean(profileRow.stripeAccountId),
    availability: Number(rules[0]?.n ?? 0) > 0,
    session_type: types > 0,
    contact_form: templateTouched(forms, profileRow.createdAt),
    embed: embedOrigins.length > 0 || Number(snippetCopied[0]?.n ?? 0) > 0,
    branding_domain: brand.removeBranding === true || Number(domainsCount[0]?.n ?? 0) > 0,
    contract: templateTouched(contractsTemplates, profileRow.createdAt) || Number(contractsCount[0]?.n ?? 0) > 0,
    demo_gallery: Number(demo[0]?.n ?? 0) > 0,
  };

  const steps = SETUP_STEPS.map((s) => ({ ...s, done: doneMap[s.id] }));
  return {
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    dismissed: profileRow.setupDismissedAt !== null,
  };
}

/* ---------------- Dismiss / reopen ---------------- */

export async function dismissSetup(organizationId: string, byUserId: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db
      .update(schema.studioProfiles)
      .set({ setupDismissedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.studioProfiles.organizationId, organizationId)),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      actorId: byUserId,
      action: "setup.guide_dismissed",
      targetType: "studio_profile",
      targetId: organizationId,
    }),
  ]);
}

export async function reopenSetup(organizationId: string, byUserId: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db
      .update(schema.studioProfiles)
      .set({ setupDismissedAt: null, setupReopenedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.studioProfiles.organizationId, organizationId)),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      actorId: byUserId,
      action: "setup.guide_reopened",
      targetType: "studio_profile",
      targetId: organizationId,
    }),
  ]);
}

/* ---------------- Snippet-copied beacon (item 7) ---------------- */

/** Fires from EmbedHub's copy button — item 7's cheap completion signal. */
export async function markEmbedSnippetCopied(organizationId: string, byUserId: string): Promise<void> {
  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "user",
    actorId: byUserId,
    action: "studio.embed_snippet_copied",
    targetType: "studio_profile",
    targetId: organizationId,
  });
}

/* ---------------- Demo gallery (item 10) ---------------- */

/** The four landing images the demo ships with — repo static assets, served
 * through the ASSETS binding and re-put into the studio's own R2 prefix so
 * the demo is a REAL asset pipeline product (quota-honest, margin-excluded
 * via project.demo). */
const DEMO_IMAGES = ["wedding-couple.jpg", "portrait-woman.jpg", "family.jpg", "maternity.jpg"];

/** Minimal valid JPEG (1×1, gray) — the test/dev fallback when the ASSETS
 * binding is absent; the pipeline stays exercised end-to-end. */
const PLACEHOLDER_JPEG = Uint8Array.from(atob(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmAA//9k=",
), (c) => c.charCodeAt(0));

async function demoImageBytes(filename: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const assets = (env as { ASSETS?: { fetch: (input: RequestInfo) => Promise<Response> } }).ASSETS;
  if (assets) {
    try {
      const res = await assets.fetch(new Request(`https://demo.local/imgs/landing/${filename}`));
      if (res.ok) return { bytes: await res.arrayBuffer(), contentType: "image/jpeg" };
    } catch {
      /* fall through to placeholder */
    }
  }
  return { bytes: PLACEHOLDER_JPEG.buffer.slice(0, PLACEHOLDER_JPEG.byteLength) as ArrayBuffer, contentType: "image/jpeg" };
}

/** The org owner's email — the demo gallery is delivered to them. */
export async function getOwnerEmail(organizationId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ email: schema.user.email, name: schema.user.name })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.role, "owner")))
    .limit(1);
  return rows[0]?.email ?? null;
}

export async function createDemoGallery(params: {
  organizationId: string;
  userId: string;
}): Promise<{ ok: true; galleryUrl: string } | { ok: false; error: "no_owner" }> {
  const db = getDb();
  const ownerEmail = await getOwnerEmail(params.organizationId);
  if (!ownerEmail) return { ok: false, error: "no_owner" };

  // Idempotent: reuse the demo project (and a still-active grant to the
  // owner) so pressing the button twice never doubles anything.
  let demoProject = (
    await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.organizationId, params.organizationId), eq(schema.projects.demo, 1)))
      .limit(1)
  )[0];

  if (!demoProject) {
    const projectId = crypto.randomUUID();
    const ownerNameRow = (
      await db
        .select({ name: schema.user.name })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
        .where(and(eq(schema.member.organizationId, params.organizationId), eq(schema.member.role, "owner")))
        .limit(1)
    )[0];
    demoProject = (
      await db
        .insert(schema.projects)
        .values({
          id: projectId,
          organizationId: params.organizationId,
          title: `${ownerNameRow?.name?.split(" ")[0] ?? "My"} demo gallery`,
          status: "complete",
          demo: 1,
        })
        .returning()
    )[0];
  }

  const existingAssets = await db
    .select({ id: schema.assets.id })
    .from(schema.assets)
    .where(and(eq(schema.assets.organizationId, params.organizationId), eq(schema.assets.projectId, demoProject.id)));

  let assetIds = existingAssets.map((a) => a.id);
  if (assetIds.length === 0) {
    const inserted: string[] = [];
    for (const filename of DEMO_IMAGES) {
      const { bytes, contentType } = await demoImageBytes(filename);
      const assetId = crypto.randomUUID();
      const storageKey = await putObject(
        params.organizationId,
        `${demoProject.id}/${assetId}/${filename}`,
        bytes,
        contentType,
      );
      await db.insert(schema.assets).values({
        id: assetId,
        organizationId: params.organizationId,
        projectId: demoProject.id,
        storageKey,
        kind: "image",
        filename,
        mimeType: contentType,
        bytes: bytes.byteLength,
        status: "approved",
        uploadedBy: params.userId,
      });
      inserted.push(assetId);
    }
    assetIds = inserted;
  }

  // Reuse an active grant to the owner when one exists; else create fresh.
  const activeGrant = (
    await db
      .select()
      .from(schema.shareGrants)
      .where(
        and(
          eq(schema.shareGrants.organizationId, params.organizationId),
          eq(schema.shareGrants.projectId, demoProject.id),
          eq(schema.shareGrants.clientEmail, ownerEmail),
          eq(schema.shareGrants.status, "active"),
        ),
      )
      .limit(1)
  )[0];

  const { createShareGrant } = await import("@/lib/shares/grants");
  let grantId = activeGrant?.id ?? null;
  let token = activeGrant ? await getGrantToken(activeGrant) : null;
  if (!token) {
    const grant = await createShareGrant({
      organizationId: params.organizationId,
      projectId: demoProject.id,
      clientEmail: ownerEmail,
      assetIds,
      expiresAt: null,
      createdById: params.userId,
      allowDownload: true,
    });
    if (!grant.ok) return { ok: false, error: "no_owner" }; // no_assets on an empty write — unreachable by construction
    grantId = grant.grantId;
    token = grant.token;
  }

  const { clientUrl } = await import("@/lib/client-urls");
  const galleryUrl = await clientUrl(params.organizationId, `/g/${token}`);

  // The standard gallery email — same template, same gate, same pipeline.
  try {
    const { sendGrantEmail } = await import("@/lib/shares/notify");
    const { getStudioProfile } = await import("./studios");
    const profile = await getStudioProfile(params.organizationId);
    await sendGrantEmail({
      organizationId: params.organizationId,
      clientEmail: ownerEmail,
      clientName: profile?.studioName ?? "there",
      galleryUrl,
      photoCount: assetIds.length,
      expiresAt: null,
      grantId: grantId!,
      fresh: true,
    });
  } catch (err) {
    console.error("demo gallery email failed:", String(err)); // the link is on-screen regardless
  }

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.userId,
    action: "setup.demo_gallery_created",
    targetType: "project",
    targetId: demoProject.id,
  });

  return { ok: true, galleryUrl };
}

/* ---------------- Daily activation rollup ---------------- */

/** One raw-SQL pass over every org (≤500) computing each setup-signal as an
 * EXISTS — feeds the daily cron's ops line: how many studios are at ≥7/10
 * and the median stage. */
export async function setupCompletionRollup(): Promise<{ orgs: number; atLeastSeven: number; medianDone: number }> {
  const rows = await getDb().all<{ done: number }>(sql`
    SELECT
      (sp.studio_name != '') +
      (sp.logo_key IS NOT NULL) +
      (sp.stripe_account_id IS NOT NULL) +
      EXISTS(SELECT 1 FROM availability_rule r WHERE r.organization_id = sp.organization_id AND r.active = 1) +
      EXISTS(SELECT 1 FROM session_type st WHERE st.organization_id = sp.organization_id AND st.active = 1) +
      EXISTS(SELECT 1 FROM template t WHERE t.organization_id = sp.organization_id AND t.kind = 'form' AND t.archived_at IS NULL
             AND (t.updated_at > t.created_at OR t.created_at > sp.created_at + 60)) +
      ((sp.embed_origins != '[]' AND sp.embed_origins != '') OR
       EXISTS(SELECT 1 FROM audit_log al WHERE al.organization_id = sp.organization_id AND al.action = 'studio.embed_snippet_copied')) +
      (COALESCE(json_extract(sp.brand, '$.removeBranding'), 0) = 1 OR
       EXISTS(SELECT 1 FROM custom_domain cd WHERE cd.organization_id = sp.organization_id AND cd.removed_at IS NULL)) +
      (EXISTS(SELECT 1 FROM template t2 WHERE t2.organization_id = sp.organization_id AND t2.kind = 'contract' AND t2.archived_at IS NULL
              AND (t2.updated_at > t2.created_at OR t2.created_at > sp.created_at + 60)) OR
       EXISTS(SELECT 1 FROM contract c WHERE c.organization_id = sp.organization_id)) +
      EXISTS(SELECT 1 FROM share_access_log sal
             JOIN share_grant sg ON sg.id = sal.grant_id
             JOIN project p ON p.id = sg.project_id
             WHERE p.organization_id = sp.organization_id AND p.demo = 1 AND sal.event = 'view')
      AS done
    FROM studio_profile sp
    LIMIT 500
  `);
  const counts = rows.map((r) => Number(r.done ?? 0));
  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  return {
    orgs: counts.length,
    atLeastSeven: counts.filter((c) => c >= 7).length,
    medianDone: median,
  };
}
