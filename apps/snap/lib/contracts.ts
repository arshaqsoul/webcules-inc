/* Contracts & e-signatures (WEB-158) — template with merge fields, token-
 * gated public signing (typed name + IP + UA + timestamp), signed PDF
 * archived to R2 and emailed to both parties, audit-trailed throughout. */
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "./db";
import * as schema from "./db-schema";
import { encryptToken, hashToken, mintToken } from "./shares/grants";
import { putObject } from "./storage/service";
import { renderContractPdf } from "./pdf";
import { sendEmail, contractSignRequestEmail, contractSignedEmail } from "./email";
import { getStudioProfile } from "./repos/studios";
import { safeHexColor } from "./embed";

export type ContractRow = typeof schema.contracts.$inferSelect;

export const MERGE_FIELDS = ["client_name", "studio_name", "date", "event_date", "package"] as const;

async function studioAccent(organizationId: string): Promise<{ name: string; accent: string; contactEmail: string | null }> {
  const profile = await getStudioProfile(organizationId);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  return {
    name: profile?.studioName ?? "The studio",
    accent: safeHexColor(brand.accent) ?? "#5e6ad2",
    contactEmail: profile?.contactEmail ?? null,
  };
}

/** Fill {{merge_fields}} from the project + client. Unknown fields pass
 * through untouched so drafts stay editable. */
export async function mergeContractBody(contract: ContractRow): Promise<string> {
  const db = getDb();
  const [project] = await db
    .select({ title: schema.projects.title, eventDate: schema.projects.eventDate, clientId: schema.projects.clientId })
    .from(schema.projects)
    .where(eq(schema.projects.id, contract.projectId))
    .limit(1);
  let clientName = contract.clientEmail?.split("@")[0] ?? "the client";
  if (project?.clientId) {
    const [client] = await db
      .select({ name: schema.clients.name })
      .from(schema.clients)
      .where(eq(schema.clients.id, project.clientId))
      .limit(1);
    if (client?.name) clientName = client.name;
  }
  const studio = await studioAccent(contract.organizationId);
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const event = project?.eventDate
    ? project.eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "the scheduled date";
  return contract.body
    .replaceAll("{{client_name}}", clientName)
    .replaceAll("{{studio_name}}", studio.name)
    .replaceAll("{{date}}", today)
    .replaceAll("{{event_date}}", event)
    .replaceAll("{{package}}", project?.title ?? "the package");
}

export async function createContract(params: {
  organizationId: string;
  projectId: string;
  title: string;
  body: string;
  clientEmail?: string | null;
}): Promise<ContractRow> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.insert(schema.contracts).values({
    id,
    organizationId: params.organizationId,
    projectId: params.projectId,
    title: params.title.slice(0, 120),
    body: params.body.slice(0, 30_000),
    status: "draft",
    clientEmail: params.clientEmail?.toLowerCase() ?? null,
  });
  return (await getContract(params.organizationId, id))!;
}

export async function getContract(organizationId: string, contractId: string): Promise<ContractRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.contracts)
    .where(and(eq(schema.contracts.organizationId, organizationId), eq(schema.contracts.id, contractId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listProjectContracts(organizationId: string, projectId: string): Promise<ContractRow[]> {
  return getDb()
    .select()
    .from(schema.contracts)
    .where(and(eq(schema.contracts.organizationId, organizationId), eq(schema.contracts.projectId, projectId)))
    .orderBy(sql`${schema.contracts.createdAt} DESC`);
}

/** Draft → sent: merge fields (frozen into the stored body), mint the token,
 * email the signing link. */
export async function sendContract(organizationId: string, contractId: string): Promise<
  { ok: true; url: string } | { ok: false; error: "not_found" | "already_sent" | "signed" | "no_recipient" | "email_failed" }
> {
  const db = getDb();
  const contract = await getContract(organizationId, contractId);
  if (!contract) return { ok: false, error: "not_found" };
  if (contract.status === "signed") return { ok: false, error: "signed" };
  if (contract.status === "sent") return { ok: false, error: "already_sent" };
  if (!contract.clientEmail) return { ok: false, error: "no_recipient" };

  const merged = await mergeContractBody(contract);
  const token = mintToken();
  await db
    .update(schema.contracts)
    .set({
      body: merged,
      status: "sent",
      sentAt: new Date(),
      accessTokenHash: await hashToken(token),
      tokenEnc: await encryptToken(token),
    })
    .where(and(eq(schema.contracts.organizationId, organizationId), eq(schema.contracts.id, contractId)));

  const studio = await studioAccent(organizationId);
  const url = `https://snap.webcules.com/c/${token}`;
  const tmpl = contractSignRequestEmail(studio.name, {
    accent: studio.accent,
    title: contract.title,
    signUrl: url,
  });
  const sent = await sendEmail({
    to: contract.clientEmail,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
    organizationId,
    template: "contract.sign_request",
    refId: contractId,
  });
  if (!sent) return { ok: false, error: "email_failed" };

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "user",
    action: "contract.sent",
    targetType: "project",
    targetId: contract.projectId,
    meta: JSON.stringify({ contractId, title: contract.title }),
  });
  return { ok: true, url };
}

export async function voidContract(organizationId: string, contractId: string): Promise<{ ok: true } | { ok: false; error: "not_found" | "signed" }> {
  const db = getDb();
  const contract = await getContract(organizationId, contractId);
  if (!contract) return { ok: false, error: "not_found" };
  if (contract.status === "signed") return { ok: false, error: "signed" };
  await db
    .update(schema.contracts)
    .set({ status: "void" })
    .where(and(eq(schema.contracts.organizationId, organizationId), eq(schema.contracts.id, contractId)));
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "user",
    action: "contract.voided",
    targetType: "project",
    targetId: contract.projectId,
    meta: JSON.stringify({ contractId, title: contract.title }),
  });
  return { ok: true };
}

export async function resolveContractByToken(token: string): Promise<ContractRow | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const rows = await getDb()
    .select()
    .from(schema.contracts)
    .where(eq(schema.contracts.accessTokenHash, await hashToken(token)))
    .limit(1);
  const contract = rows[0];
  if (!contract || contract.status === "void" || contract.status === "draft") return null;
  return contract;
}

/** The signing act: typed name + IP + UA + timestamp → signed PDF to R2 →
 * email to both parties. Audit-trailed. */
export async function signContract(
  token: string,
  signer: { name: string; ip: string | null; userAgent: string | null },
): Promise<{ ok: true; pdfUrl: string } | { ok: false; error: "not_found" | "already_signed" }> {
  const db = getDb();
  const contract = await resolveContractByToken(token);
  if (!contract) return { ok: false, error: "not_found" };
  if (contract.status === "signed") return { ok: false, error: "already_signed" };

  const signedAt = new Date();
  const studio = await studioAccent(contract.organizationId);
  const pdf = await renderContractPdf({
    studioName: studio.name,
    accent: studio.accent,
    title: contract.title,
    body: contract.body,
    signerName: signer.name.trim(),
    signedAt,
    signerIp: signer.ip,
    clientEmail: contract.clientEmail,
  });
  const suffix = `${contract.projectId}/contracts/${contract.id}-signed.pdf`;
  await putObject(contract.organizationId, suffix, pdf.slice().buffer as ArrayBuffer, "application/pdf");
  const pdfKey = `${contract.organizationId}/${suffix}`;

  await db
    .update(schema.contracts)
    .set({
      status: "signed",
      signedAt,
      signerName: signer.name.trim().slice(0, 120),
      signerIp: signer.ip,
      signerUserAgent: signer.userAgent?.slice(0, 250) ?? null,
      pdfKey,
    })
    .where(eq(schema.contracts.id, contract.id));

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: contract.organizationId,
    actorType: "client",
    action: "contract.signed",
    targetType: "project",
    targetId: contract.projectId,
    ip: signer.ip,
    userAgent: signer.userAgent?.slice(0, 250) ?? null,
    meta: JSON.stringify({ contractId: contract.id, title: contract.title, signer: signer.name.trim(), signedAt: signedAt.toISOString() }),
  });

  // Both parties get the signed PDF link.
  const url = `https://snap.webcules.com/c/${token}`;
  const tmpl = contractSignedEmail(studio.name, {
    accent: studio.accent,
    title: contract.title,
    signerName: signer.name.trim(),
    signedAt,
    contractUrl: url,
  });
  const recipients = [contract.clientEmail, studio.contactEmail].filter((e): e is string => Boolean(e));
  for (const to of recipients) {
    await sendEmail({
      to,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      organizationId: contract.organizationId,
      template: "contract.signed",
      refId: contract.id,
    });
  }
  return { ok: true, pdfUrl: url };
}

/** Signed-PDF bytes (staff session or token holders). */
export async function getContractPdf(contract: ContractRow): Promise<BodyInit | null> {
  if (!contract.pdfKey) return null;
  const { getObject } = await import("./storage/service");
  const obj = await getObject(contract.organizationId, contract.pdfKey);
  return obj ? (obj.body as ReadableStream) : null;
}
