#!/usr/bin/env node
/* STAGING demo seeder — populates https://snap-staging.webcules.com with a
 * rich, click-throughable photographer studio ("Amara & Oak Photography").
 *
 * Scope guards (hard): D1 `webcules-snap-staging` + R2 `snap-staging`, both
 * REMOTE only. Production (`webcules-snap` / `snap-webcules`) is never named.
 *
 * Photos come from tools/sample-pack.json — the AI-generated (SDXL) sample
 * pack. License: no subject rights, no model release required; sample photos
 * must never be attributed to a real studio — this fictional demo studio on
 * staging is exactly that.
 *
 * Idempotent: every id below is a fixed constant. Re-runs DELETE the demo
 * user + organization (cascades every tenant row) and re-insert, and re-PUT
 * the same R2 keys (put overwrites). The gallery/contract share tokens are
 * derived deterministically so links printed by earlier runs keep resolving.
 *
 * Usage (from apps/snap):
 *   python tools/generate-demo-data.py
 *   node tools/seed-staging-demo.mjs
 */
import { exec as execCb, execFile as execFileCb } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { hashPassword } from "better-auth/crypto";

const execFile = promisify(execFileCb);
const execShell = promisify(execCb);
const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");

/* ---- environment guards (STAGING ONLY — do not parameterize) ---------- */
const DB_NAME = "webcules-snap-staging";
const BUCKET = "snap-staging";
const APP_URL = "https://snap-staging.webcules.com";

/* ---- fixed identity (idempotent re-runs) ------------------------------ */
const ORG_ID = "6b1f4c2e-8a3d-4e57-9c21-b0f8d3a4e5c1";
const USER_ID = "d94a7b21-5c08-4f36-8e2d-47b9c1f6a0e3";
const ACCOUNT_ID = "0f5c8e31-92b4-4d67-a3f8-6e0d2b9c4a77";
const MEMBER_ID = "c7e29d40-1b6a-4c58-9f0e-3a8d5b2c6e91";
const EMBED_KEY = "9f4a02be71cd48e5b3c6a0f18d2e74b9";
const ORG_SLUG = "amara-oak-photography";

const PROJ_WED = "demo-proj-wedding";
const PROJ_FAM = "demo-proj-family";
const PROJ_CORP = "demo-proj-corporate";
const PROJ_NEW = "demo-proj-newborn";
const GRANT_ID = "demo-grant-wedding";
const FAV_LIST_ID = "demo-flist-wedding";
const ALBUM_THREAD_ID = "demo-thread-album";

/* Deterministic share tokens (base64url, grant-pattern length) — hashed to
 * SHA-256 for storage; raw value only ever lives in the printed link. */
const urlsafe = (s) => createHash("sha256").update(s).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha256hex = (s) => createHash("sha256").update(s).digest("hex");
const GALLERY_TOKEN = urlsafe("snap-demo-gallery-token-v1");
const CONTRACT_TOKEN = urlsafe("snap-demo-contract-token-v1");

/* ---- inputs ------------------------------------------------------------ */
const demo = JSON.parse(readFileSync(join(here, "demo-data.json"), "utf8"));
const pack = JSON.parse(readFileSync(join(here, "sample-pack.json"), "utf8")).genres;
const weddingDraft = JSON.parse(readFileSync(join(here, "seed-drafts", "classic-wedding.json"), "utf8"));

const sample = (genre, name) => {
  const e = pack[genre]?.find((x) => x.name === name);
  if (!e) throw new Error(`sample-pack.json has no ${genre}/${name}`);
  return e;
};
const packFile = (entry, variant) => {
  const p = join(appRoot, "tools", "sample-pack", entry.paths[variant]);
  if (!existsSync(p)) throw new Error(`sample-pack file missing: ${p}`);
  return p;
};

/* ---- time helpers (D1 timestamp columns are epoch SECONDS) ------------ */
const now = () => Math.floor(Date.now() / 1000);
const at = (dayOffset, hourUtc = 12) => Math.floor((Date.now() + dayOffset * 86_400_000) / 1000);
const isoDay = (dayOffset) => new Date(Date.now() + dayOffset * 86_400_000).toISOString().slice(0, 10);
/** Epoch seconds for a wall-clock time in America/New_York on dayOffset. */
const et = (dayOffset, time) => {
  const ref = new Date(Date.now() + dayOffset * 86_400_000);
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" });
  const name = dtf.formatToParts(ref).find((p) => p.type === "timeZoneName")?.value ?? "GMT-4";
  const m = name.match(/GMT([+-])(\d+)/);
  const off = m ? `${m[1]}${m[2].padStart(2, "0")}:00` : "-04:00";
  return Math.floor(Date.parse(`${isoDay(dayOffset)}T${time}${off}`) / 1000);
};
const prettyDay = (dayOffset) =>
  new Date(Date.now() + dayOffset * 86_400_000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/* ---- SQL emission ------------------------------------------------------- */
const stmts = [];
const S = (v) => `'${String(v).replace(/'/g, "''")}'`;
const N = (v) => (v === null || v === undefined ? "NULL" : String(v));
const J = (o) => S(JSON.stringify(o));
const insert = (table, cols, rows) => {
  for (const row of rows) {
    /* null/undefined -> SQL NULL (Array.join would render them empty);
     * everything else arrives pre-quoted via S()/J() or as a number */
    stmts.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${row.map((v) => (v === null || v === undefined ? "NULL" : String(v))).join(", ")});`);
  }
};

/* ---- studio identity ---------------------------------------------------- */
const STUDIO = {
  name: "Amara & Oak Photography",
  email: "amara@webcules.com",
  userName: "Amara Osei",
  tz: "America/New_York",
};
const BUSINESS = {
  legalName: "Amara & Oak Photography LLC",
  addressLines: ["412 Grove Street, Suite 3", "Montclair, NJ 07042"],
  taxId: { label: "EIN", value: "88-2419075" },
  phone: "+1 (973) 555-0164",
  website: "ameraandoak.com",
};
const INVOICE_SETTINGS = {
  numberPrefix: "AO-",
  numberPadding: 4,
  resetYearly: false,
  taxLabel: "NJ sales tax (6.625%)",
  taxRateBps: 663,
  dueDays: 14,
  termsText: "Payment due within 14 days of the invoice date. Late balances accrue 1.5% monthly.",
  footerNote: "Thank you for letting us tell your story.",
  latePolicy: "1.5% monthly on overdue balances.",
  memo: "",
};
const BOOKING_PAGE = {
  hero: { title: "Photography that feels like you", subtitle: "Weddings, families and the in-between moments — warm, honest images for people who hate posing." },
  intro: { heading: "Hello, I'm Amara", body: "I photograph the loud laughs and the quiet glances in between. Based in Montclair, working across New Jersey and the Hudson Valley — bring the people you love and I'll take care of the rest." },
  faq: [
    { q: "How many photos do we get?", a: "Every collection includes a fully edited gallery. Weddings average 400+ images; portrait sessions 40–60." },
    { q: "How fast is delivery?", a: "Portrait galleries land within two weeks; weddings within six, with a sneak peek within 48 hours." },
    { q: "Do you travel?", a: "Happily — anywhere by car within two hours of Montclair is included. Beyond that, ask about travel." },
    { q: "What should we wear?", a: "After booking you'll get a styling guide. Short version: textures and tones you already love, nothing brand-new." },
  ],
  socials: [
    { kind: "website", url: "https://ameraandoak.com" },
    { kind: "email", url: "mailto:amara@webcules.com" },
  ],
  thanks: { title: "You're on the books!", body: "Watch your inbox for a confirmation and a short prep guide. See you soon!" },
  showSessionTypes: "auto",
};

/* ---- clients ------------------------------------------------------------ */
const cli = (i) => ({ ...demo.clients[i], id: `demo-cli-${i + 1}` });
const CL_PRIYA = cli(0);
const CL_FAMILY = cli(1);
const CL_CORP = cli(2);
const CL_NEWBORN = cli(3);
const clients = [CL_PRIYA, CL_FAMILY, CL_CORP, CL_NEWBORN, cli(4)];

/* ---- leads + messages + threads ---------------------------------------- */
const leads = demo.leads.map((l, i) => ({
  ...l,
  id: `demo-lead-${i + 1}`,
  createdAt: Math.min(...l.messages.map((m) => at(-m.daysAgo))),
  messages: l.messages.map((m, j) => ({ ...m, id: `demo-lm-${i + 1}-${j + 1}` })),
}));
const LEAD_FAMILY = leads[5];

/* ---- assets ------------------------------------------------------------- */
const WED_NAMES = Array.from({ length: 10 }, (_, i) => `wedding-${String(i + 1).padStart(2, "0")}`);
const FAM_NAMES = Array.from({ length: 6 }, (_, i) => `family-${String(i + 1).padStart(2, "0")}`);
const FOLDERS = [
  { id: "demo-fol-ceremony", name: "Ceremony", sort: 0 },
  { id: "demo-fol-portraits", name: "Portraits", sort: 1 },
  { id: "demo-fol-reception", name: "Reception", sort: 2 },
];
const folderFor = (i) => FOLDERS[i < 4 ? 0 : i < 7 ? 1 : 2];

const assetRows = [];
const uploads = [];
const addAssets = (projectId, genre, names, createdDayOffset, folderFn, ratings = {}) => {
  names.forEach((name, i) => {
    const entry = sample(genre, name);
    const id = `demo-ast-${projectId.replace("demo-proj-", "")}-${String(i + 1).padStart(2, "0")}`;
    const filename = `${name}.jpg`;
    const master = packFile(entry, "master");
    const web = packFile(entry, "web");
    const thumb = packFile(entry, "thumb");
    const folder = folderFn ? folderFn(i) : null;
    assetRows.push({
      id,
      projectId,
      filename,
      bytes: statSync(master).size,
      width: entry.masterWidth,
      height: entry.masterHeight,
      folderId: folder?.id ?? null,
      folderName: folder?.name ?? null,
      stars: ratings[name]?.stars ?? 0,
      color: ratings[name]?.color ?? 0,
      createdAt: at(createdDayOffset) + i * 60,
    });
    uploads.push(
      { key: `${ORG_ID}/${projectId}/${id}/${filename}`, file: master },
      { key: `${ORG_ID}/${projectId}/${id}/preview.jpg`, file: web },
      { key: `${ORG_ID}/${projectId}/${id}/thumb.jpg`, file: thumb },
    );
    return id;
  });
  return names.map((_, i) => `demo-ast-${projectId.replace("demo-proj-", "")}-${String(i + 1).padStart(2, "0")}`);
};
const weddingAssetIds = addAssets(PROJ_WED, "wedding", WED_NAMES, -12, folderFor, {
  "wedding-02": { stars: 5, color: 3 },
  "wedding-05": { stars: 4 },
  "wedding-09": { stars: 3 },
});
const familyAssetIds = addAssets(PROJ_FAM, "family", FAM_NAMES, -7, null, { "family-01": { stars: 5, color: 3 } });

/* ---- gallery design: classic-wedding remapped onto real asset ids ------ */
const design = JSON.parse(JSON.stringify(weddingDraft.design));
const hero = design.sections.find((s) => s.type === "hero");
hero.images = hero.images.map((img, i) => ({ ...img, assetId: weddingAssetIds[i] ?? weddingAssetIds[0] }));
hero.title = "Priya & Daniel";
hero.subtitle = `A ${prettyDay(-24).split(" ")[0]} wedding at Willow Creek Estate`;
const GALLERY_DESIGN_JSON = JSON.stringify(design);

/* ---- projects ----------------------------------------------------------- */
const projects = [
  {
    id: PROJ_WED, ...demo.projects.wedding, status: "complete", client: CL_PRIYA, lead: null,
    eventAt: at(-demo.projects.wedding.eventDaysAgo), quoted: 355000, created: at(-60), updated: at(-10),
    galleryDesign: GALLERY_DESIGN_JSON,
  },
  {
    id: PROJ_FAM, ...demo.projects.family, status: "evaluation", client: CL_FAMILY, lead: LEAD_FAMILY,
    eventAt: at(-demo.projects.family.eventDaysAgo), quoted: 42500, created: at(-25), updated: at(-7), galleryDesign: null,
  },
  {
    id: PROJ_CORP, ...demo.projects.corporate, status: "snapping", client: CL_CORP, lead: null,
    eventAt: at(-demo.projects.corporate.eventDaysAgo), quoted: 120000, created: at(-12), updated: at(-1), galleryDesign: null,
  },
  {
    id: PROJ_NEW, ...demo.projects.newborn, status: "evaluation", client: CL_NEWBORN, lead: null,
    eventAt: at(-demo.projects.newborn.eventDaysAgo), quoted: 9500, created: at(-20), updated: at(-2), galleryDesign: null,
  },
];
const PROJ_BY_ID = Object.fromEntries(projects.map((p) => [p.id, p]));

/* ---- invoices / payments ------------------------------------------------ */
const TAX_BPS = INVOICE_SETTINGS.taxRateBps;
const taxFor = (subtotal) => Math.round((subtotal * TAX_BPS) / 10000);
const subtotalOf = (lines) => lines.reduce((n, l) => n + l.qty * l.amountMinor, 0);
const mkInvoice = (key, projectId, clientEmail, dayIssued) => {
  const d = demo.invoices[key];
  const sub = subtotalOf(d.lines);
  const total = sub + taxFor(sub);
  return {
    id: `demo-inv-${key}`, projectId, clientEmail, number: d.number, status: d.status,
    lines: JSON.stringify(d.lines), total, issued: at(dayIssued), due: at(dayIssued + d.dueDaysAfter), memo: d.memo, dayIssued,
  };
};
const invoices = [
  mkInvoice("paid", PROJ_WED, CL_PRIYA.email, -32),
  mkInvoice("open", PROJ_FAM, CL_FAMILY.email, -5),
  mkInvoice("overdue", PROJ_CORP, CL_CORP.email, -34),
];
const payments = [
  { id: "demo-pay-1", projectId: PROJ_WED, kind: "deposit", amount: 50000, occurred: at(-45), note: "Date retainer" },
  { id: "demo-pay-2", projectId: PROJ_WED, kind: "balance", amount: invoices[0].total - 50000, occurred: at(-30), note: "Final payment — card via invoice AO-0001" },
  { id: "demo-pay-3", projectId: PROJ_CORP, kind: "deposit", amount: 40000, occurred: at(-34), note: "Deposit on headshot package" },
];

/* ---- contracts (merged bodies; sent contracts store merged text) -------- */
const merge = (body, vars) => body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
const coupleName = "Daniel & Priya Fernando";
const familyName = `The ${CL_FAMILY.name.split().pop()} Family`;
const contracts = [
  {
    id: "demo-ctr-wedding", projectId: PROJ_WED, title: "Wedding photography agreement — Daniel & Priya",
    status: "signed", clientEmail: CL_PRIYA.email, sentAt: at(-55), signedAt: at(-53), created: at(-55),
    signerName: "Priya Fernando", signerIp: "24.188.112.7", signerUa: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    tokenHash: null,
    body: merge(demo.contracts.wedding, {
      studio_name: STUDIO.name, client_name: coupleName, project_title: PROJ_BY_ID[PROJ_WED].title, event_date: prettyDay(-24),
    }),
  },
  {
    id: "demo-ctr-family", projectId: PROJ_FAM, title: `Portrait session agreement — ${familyName}`,
    status: "sent", clientEmail: CL_FAMILY.email, sentAt: at(-5), signedAt: null, created: at(-5),
    signerName: null, signerIp: null, signerUa: null,
    tokenHash: sha256hex(CONTRACT_TOKEN),
    body: merge(demo.contracts.portrait, {
      studio_name: STUDIO.name, client_name: familyName, project_title: PROJ_BY_ID[PROJ_FAM].title, event_date: prettyDay(-8),
    }),
  },
];

/* ---- bookings (calendar surface) ---------------------------------------- */
const bookings = [
  {
    id: "demo-bkg-corp", projectId: PROJ_CORP, sessionType: "demo-st-portrait", start: et(-1, "09:30:00"), end: et(-1, "12:30:00"),
    clientEmail: CL_CORP.email, clientName: CL_CORP.name, status: "confirmed", payment: "deposit_paid",
    notes: "Conference room B converted to a studio; 14 people, two rounds for blinkers.", created: at(-12),
  },
  {
    id: "demo-bkg-call", projectId: null, sessionType: "demo-st-discovery", start: et(3, "11:00:00"), end: et(3, "11:30:00"),
    clientEmail: leads[3].email, clientName: leads[3].name, status: "pending", payment: "unpaid",
    notes: "Newborn planning call — walk through the day-8 studio session.", created: at(-1),
  },
];

/* ---- favorites (default list + 6 picks, 2 notes) ------------------------ */
const favorites = weddingAssetIds.slice(0, 6).map((assetId, i) => ({
  assetId,
  note: i === 1 ? "The light here is everything — print this one big." : i === 3 ? "Mom asked for a copy of this one." : null,
  createdAt: at(-8) + i * 90,
}));

/* ======================================================================= *
 * BUILD SQL
 * ======================================================================= */
stmts.push(`-- GENERATED by tools/seed-staging-demo.mjs — STAGING demo data. Do not edit by hand.`);
stmts.push(`-- Studio: ${STUDIO.name} (org ${ORG_ID}) — idempotent: deletes then re-inserts.`);
stmts.push(`DELETE FROM inbox_item WHERE user_id = ${S(USER_ID)};`);
stmts.push(`DELETE FROM "user" WHERE id = ${S(USER_ID)};`);
stmts.push(`DELETE FROM organization WHERE id = ${S(ORG_ID)};`);
/* org_counter has no FK to organization — clean it explicitly for idempotency */
stmts.push(`DELETE FROM org_counter WHERE organization_id = ${S(ORG_ID)};`);

insert("organization", ["id", "name", "slug", "created_at", "updated_at"],
  [[S(ORG_ID), S(STUDIO.name), S(ORG_SLUG), at(-90), at(-10)]]);
insert('"user"', ["id", "name", "email", "email_verified", "created_at", "updated_at"],
  [[S(USER_ID), S(STUDIO.userName), S(STUDIO.email), 1, at(-90), at(-10)]]);
insert("account", ["id", "user_id", "account_id", "provider_id", "password", "created_at", "updated_at"],
  [[S(ACCOUNT_ID), S(USER_ID), S(USER_ID), S("credential"), S(await hashPassword("TestPass123!x")), at(-90), at(-10)]]);
insert("member", ["id", "organization_id", "user_id", "role", "created_at"],
  [[S(MEMBER_ID), S(ORG_ID), S(USER_ID), S("owner"), at(-90)]]);
insert("studio_profile",
  ["organization_id", "studio_name", "contact_email", "timezone", "brand", "embed_key", "plan", "plan_status", "business", "invoice_settings", "booking_page", "last_active_at", "created_at", "updated_at"],
  [[S(ORG_ID), S(STUDIO.name), S(STUDIO.email), S(STUDIO.tz), J({ accent: "#b0713f" }), S(EMBED_KEY), S("studio"), S("active"), J(BUSINESS), J(INVOICE_SETTINGS), J(BOOKING_PAGE), now(), at(-90), at(-10)]]);

insert("session_type",
  ["id", "organization_id", "name", "slug", "description", "color", "icon", "slot_minutes", "buffer_minutes", "min_lead_hours", "max_advance_days", "price_minor", "deposit_kind", "deposit_minor", "availability_mode", "gallery_defaults", "active", "sort_order", "created_at", "updated_at"],
  [
    [S("demo-st-discovery"), S(ORG_ID), S("Discovery Call"), S("discovery-call"), S("A free 30-minute video or phone call — dates, collections, and whether we're the right fit."), S("#6b8f71"), S("sparkles"), 30, 0, 24, 60, null, null, null, S("inherit"), S("{}"), 1, 0, at(-90), at(-10)],
    [S("demo-st-portrait"), S(ORG_ID), S("Portrait Session"), S("portrait-session"), S("60 minutes on location or in studio — families, seniors, headshots. Fully edited gallery included."), S("#b0713f"), S("camera"), 60, 15, 48, 120, 25000, null, null, S("inherit"), S("{}"), 1, 1, at(-90), at(-10)],
    [S("demo-st-wedding"), S(ORG_ID), S("Wedding Day"), S("wedding-day"), S("Eight hours of coverage with a second photographer, sneak peek in 48 hours, gallery in six weeks."), S("#8d6b8f"), S("rings"), 480, 60, 336, 540, 280000, S("deposit"), 50000, S("inherit"), S("{}"), 1, 2, at(-90), at(-10)],
  ]);

insert("availability_rule", ["id", "organization_id", "weekday", "start_minute", "end_minute", "slot_minutes", "buffer_minutes", "active", "created_at"],
  [1, 2, 3, 4, 5, 6].map((wd, i) => [S(`demo-av-${i + 1}`), S(ORG_ID), wd, 540, 1080, 60, 0, 1, at(-90)]));

insert("client", ["id", "organization_id", "email", "name", "phone", "notes", "created_at", "updated_at"],
  clients.map((c, i) => [S(c.id), S(ORG_ID), S(c.email.toLowerCase()), S(c.name), N(c.phone ? S(c.phone) : null), N(c.notes ? S(c.notes) : null), at(-80 + i * 10), at(-20)]));

insert("lead",
  ["id", "organization_id", "name", "email", "phone", "event_date", "event_type", "message", "source", "status", "embed_origin", "created_at", "updated_at"],
  leads.map((l) => [
    S(l.id), S(ORG_ID), S(l.name), S(l.email.toLowerCase()), N(l.phone ? S(l.phone) : null),
    l.eventDate ? Math.floor(Date.parse(`${l.eventDate}T12:00:00Z`) / 1000) : null,
    N(l.eventType ? S(l.eventType) : null), N(l.message ? S(l.message) : null), S(l.source), S(l.status), N(l.source === "contact_form" ? S("https://ameraandoak.com") : null),
    l.createdAt, l.messages.length ? at(-l.messages[l.messages.length - 1].daysAgo) : l.createdAt,
  ]));

insert("lead_message", ["id", "organization_id", "lead_id", "direction", "from_user_id", "subject", "body", "created_at"],
  leads.flatMap((l) =>
    l.messages.map((m) => [
      S(m.id), S(ORG_ID), S(l.id), S(m.direction), m.direction === "out" ? S(USER_ID) : null, N(m.subject ? S(m.subject) : null), S(m.body), at(-m.daysAgo),
    ]),
  ));

/* Threads: mirrors of the lead conversations (the 0059 absorb pattern —
 * deterministic ids 'lead-{leadId}' / 'lm-{messageId}') + one standalone
 * client email thread that needs a reply. Rows are built here; the INSERTs
 * are emitted after project/folder rows so FK references resolve. */
const threadRows = leads.map((l) => {
  const last = l.messages[l.messages.length - 1];
  return [
    S(`lead-${l.id}`), S(ORG_ID), S(l.eventType ? `${l.eventType} inquiry` : "New inquiry"), S(l.email.toLowerCase()),
    N(null), S(l.id), N(null), S(last.direction), at(-last.daysAgo), l.createdAt,
  ];
});
threadRows.push([S(ALBUM_THREAD_ID), S(ORG_ID), S(demo.emailThread.subject), S(demo.emailThread.from.toLowerCase()), S(CL_PRIYA.id), N(null), S(PROJ_WED), S("in"), at(0), at(-2)]);

const tmRows = leads.flatMap((l) =>
  l.messages.map((m) => [
    S(`lm-${m.id}`), S(`lead-${l.id}`), S(ORG_ID), S(m.direction), S(`<${m.id}@demo.mail.webcules.com>`), N(null), N(null),
    S(m.direction === "in" ? l.email.toLowerCase() : ""), N(m.subject ? S(m.subject) : null), S(m.body), S(m.direction === "in" ? "received" : "sent"), at(-m.daysAgo),
  ]),
);
demo.emailThread.messages.forEach((m, i) => {
  tmRows.push([
    S(`demo-tm-album-${i + 1}`), S(ALBUM_THREAD_ID), S(ORG_ID), S(m.direction), S(`<demo-album-${i + 1}@demo.mail.webcules.com>`), N(null), N(null),
    S(m.direction === "in" ? demo.emailThread.from.toLowerCase() : ""), S(m.subject), S(m.body), S(m.direction === "in" ? "received" : "sent"), at(-m.daysAgo),
  ]);
});

const inboxRows = [
    [S("demo-ii-lead-1"), S(USER_ID), S(ORG_ID), S("lead"), S("lead"), S("demo-lead-1"), S("lead-demo-lead-1"), S(`New inquiry — ${leads[0].name}`), S(leads[0].message?.slice(0, 240) ?? ""), null, at(-1)],
    [S("demo-ii-lead-2"), S(USER_ID), S(ORG_ID), S("lead"), S("lead"), S("demo-lead-2"), S("lead-demo-lead-2"), S(`New inquiry — ${leads[1].name}`), S(leads[1].message?.slice(0, 240) ?? ""), null, at(0)],
    [S("demo-ii-email"), S(USER_ID), S(ORG_ID), S("email"), S("email"), S(ALBUM_THREAD_ID), S(ALBUM_THREAD_ID), S(`Album delivery? — ${CL_PRIYA.name}`), S(demo.emailThread.messages[2].body.slice(0, 240)), null, at(0)],
    [S("demo-ii-gallery"), S(USER_ID), S(ORG_ID), S("gallery"), S("gallery"), S(GRANT_ID), N(null), S(`Gallery delivered — ${CL_PRIYA.name}`), S("10 photos"), at(-9), at(-10)],
    [S("demo-ii-invoice"), S(USER_ID), S(ORG_ID), S("invoice"), S("invoice"), S("demo-inv-paid"), N(null), S("Invoice AO-0001 paid"), S(`$${(invoices[0].total / 100).toFixed(2)} — Daniel & Priya wedding`), at(-29), at(-30)],
    [S("demo-ii-contract"), S(USER_ID), S(ORG_ID), S("contract"), S("contract"), S("demo-ctr-family"), N(null), S(`Contract sent — ${familyName}`), S("Portrait session agreement — awaiting signature"), at(-4), at(-5)],
    [S("demo-ii-booking"), S(USER_ID), S(ORG_ID), S("booking"), S("booking"), S("demo-bkg-call"), N(null), S(`Booking requested — ${leads[3].name}`), S("Discovery Call — pending confirmation"), null, at(-1)],
  ];

insert("project",
  ["id", "organization_id", "client_id", "lead_id", "title", "status", "event_date", "notes", "quoted_total_minor", "quoted_currency", "gallery_design", "created_at", "updated_at"],
  projects.map((p) => [
    S(p.id), S(ORG_ID), S(p.client.id), p.lead ? S(p.lead.id) : null, S(p.title), S(p.status), p.eventAt,
    N(p.notes ? S(p.notes) : null), p.quoted, S("usd"), p.galleryDesign ? S(p.galleryDesign) : null, p.created, p.updated,
  ]));

insert("project_status_event", ["id", "organization_id", "project_id", "from_status", "to_status", "actor_id", "created_at"],
  [
    [S("demo-pse-1"), S(ORG_ID), S(PROJ_WED), S("evaluation"), S("complete"), S(USER_ID), at(-10)],
    [S("demo-pse-2"), S(ORG_ID), S(PROJ_CORP), S("booked"), S("snapping"), S(USER_ID), at(-1)],
  ]);

insert("folder", ["id", "organization_id", "project_id", "name", "sort", "created_at"],
  FOLDERS.map((f) => [S(f.id), S(ORG_ID), S(PROJ_WED), S(f.name), f.sort, at(-11)]));

/* inbox plumbing — after project/folder so FK references resolve */
insert("thread", ["id", "organization_id", "subject", "client_email", "client_id", "lead_id", "project_id", "last_direction", "last_activity_at", "created_at"], threadRows);
insert("thread_message",
  ["id", "thread_id", "organization_id", "direction", "rfc_message_id", "in_reply_to", "references_chain", "from_addr", "subject", "text_preview", "status", "created_at"],
  tmRows);
insert("inbox_item",
  ["id", "user_id", "organization_id", "kind", "entity_type", "entity_id", "thread_id", "title", "preview", "read_at", "created_at"],
  inboxRows);

insert("asset",
  ["id", "organization_id", "project_id", "storage_key", "kind", "filename", "mime_type", "bytes", "width", "height", "stars", "color", "status", "thumb_key", "preview_key", "uploaded_by", "folder_id", "created_at"],
  assetRows.map((a) => [
    S(a.id), S(ORG_ID), S(a.projectId), S(`${ORG_ID}/${a.projectId}/${a.id}/${a.filename}`), S("image"), S(a.filename), S("image/jpeg"),
    a.bytes, a.width, a.height, a.stars, a.color, S("approved"), S(`${ORG_ID}/${a.projectId}/${a.id}/thumb.jpg`), S(`${ORG_ID}/${a.projectId}/${a.id}/preview.jpg`),
    S(USER_ID), a.folderId ? S(a.folderId) : null, a.createdAt,
  ]));

insert("share_grant",
  ["id", "organization_id", "project_id", "client_email", "token_hash", "status", "created_by_id", "allow_download", "proofing", "selection_mode", "created_at"],
  [[S(GRANT_ID), S(ORG_ID), S(PROJ_WED), S(CL_PRIYA.email.toLowerCase()), S(sha256hex(GALLERY_TOKEN)), S("active"), S(USER_ID), 1, 0, S("favorites"), at(-10)]]);

const wedAssets = assetRows.filter((a) => a.projectId === PROJ_WED);
insert("share_grant_asset", ["grant_id", "asset_id", "added_at", "folder_name"],
  wedAssets.map((a) => [S(GRANT_ID), S(a.id), at(-10), a.folderName ? S(a.folderName) : null]));

insert("favorite_list", ["id", "organization_id", "grant_id", "name", "created_at"],
  [[S(FAV_LIST_ID), S(ORG_ID), S(GRANT_ID), S("Favorites"), at(-10)]]);
insert("gallery_favorite", ["grant_id", "asset_id", "list_id", "organization_id", "note", "created_at"],
  favorites.map((f) => [S(GRANT_ID), S(f.assetId), S(FAV_LIST_ID), S(ORG_ID), f.note ? S(f.note) : null, f.createdAt]));

insert("invoice",
  ["id", "organization_id", "project_id", "number", "status", "lines", "total_minor", "currency", "issued_at", "due_at", "tax_label", "tax_rate_bps", "terms", "memo", "client_email", "created_at"],
  invoices.map((v) => [
    S(v.id), S(ORG_ID), S(v.projectId), S(v.number), S(v.status), S(v.lines), v.total, S("usd"), v.issued, v.due,
    S(INVOICE_SETTINGS.taxLabel), TAX_BPS, S(INVOICE_SETTINGS.termsText), v.memo ? S(v.memo) : null, S(v.clientEmail.toLowerCase()), v.issued,
  ]));

insert("payment", ["id", "organization_id", "project_id", "kind", "amount_minor", "currency", "status", "occurred_at", "method", "note", "created_at"],
  payments.map((p) => [S(p.id), S(ORG_ID), S(p.projectId), S(p.kind), p.amount, S("usd"), S("succeeded"), p.occurred, N(p.kind === "balance" ? S("card") : null), N(p.note ? S(p.note) : null), p.occurred]));

insert("contract",
  ["id", "organization_id", "project_id", "title", "body", "status", "client_email", "access_token_hash", "sent_at", "signed_at", "signer_name", "signer_ip", "signer_user_agent", "created_at"],
  contracts.map((c) => [
    S(c.id), S(ORG_ID), S(c.projectId), S(c.title), S(c.body), S(c.status), S(c.clientEmail.toLowerCase()),
    c.tokenHash ? S(c.tokenHash) : null, c.sentAt, c.signedAt, c.signerName ? S(c.signerName) : null, c.signerIp ? S(c.signerIp) : null, c.signerUa ? S(c.signerUa) : null, c.created,
  ]));

insert("booking",
  ["id", "organization_id", "project_id", "start_at", "end_at", "timezone", "client_email", "client_name", "status", "payment_status", "notes", "session_type_id", "created_at", "updated_at"],
  bookings.map((b) => [
    S(b.id), S(ORG_ID), b.projectId ? S(b.projectId) : null, b.start, b.end, S(STUDIO.tz), S(b.clientEmail.toLowerCase()), S(b.clientName),
    S(b.status), S(b.payment), S(b.notes), S(b.sessionType), b.created, b.created,
  ]));

insert("org_counter", ["organization_id", "invoice_seq", "invoice_year", "invoice_year_seq"],
  [[S(ORG_ID), 3, S(String(new Date().getUTCFullYear())), 3]]);

insert("audit_log", ["id", "organization_id", "actor_type", "actor_id", "action", "target_type", "target_id", "meta", "created_at"],
  [[S("demo-aud-1"), S(ORG_ID), S("user"), S(USER_ID), S("studio.created"), S("organization"), S(ORG_ID), S("{}"), at(-90)]]);

/* ---- starter template library (mirrors lib/repos/templates.ts
 * starterTemplateRows — what onboarding would have created for this org;
 * the seeded org bypassed signup, so we write them directly). ------------ */
const tpl = [];
let tplN = 0;
const addTpl = (kind, name, body, meta = {}, isDefault = 0) => {
  tplN += 1;
  tpl.push([S(`demo-tpl-${String(tplN).padStart(2, "0")}`), S(ORG_ID), S(kind), S(name), typeof body === "string" ? S(body) : J(body), J(meta), isDefault, at(-90), at(-90)]);
};
addTpl("contract", "Wedding photography agreement", demo.contracts.wedding, {}, 1);
addTpl("contract", "Portrait session agreement", demo.contracts.portrait, {}, 0);
addTpl("form", "General intake", {
  v: 1, title: "Get in touch", intro: "Tell us about your shoot — we usually reply within a day.",
  thankYou: "Thank you — your inquiry is in! We'll get back to you shortly.",
  fields: [
    { id: "f_name", kind: "text", label: "Name", required: true, half: true },
    { id: "f_email", kind: "email", label: "Email", required: true, half: true },
    { id: "f_phone", kind: "phone", label: "Phone", required: false, half: true },
    { id: "f_eventDate", kind: "date", label: "Event date", required: false, half: true },
    { id: "f_eventType", kind: "select", label: "What kind of shoot?", required: false, options: ["Wedding", "Engagement", "Family", "Portrait", "Event", "Commercial", "Other"] },
    { id: "f_message", kind: "textarea", label: "Tell us more", required: false },
  ],
}, {}, 1);
addTpl("email_snippet", "Inquiry reply",
  "<p>Hi {{client_name}},</p>\n<p>thank you for reaching out — it would be great to hear more about {{project_title}}. I will come back to you within one business day with availability and collections.</p>\n<p>Talk soon,<br>{{studio_name}}</p>",
  { subject: "Thank you for reaching out to {{studio_name}}" }, 1);
addTpl("email_snippet", "Booking — thank you",
  "<p>Hi {{client_name}},</p>\n<p>your session on {{event_date}} is confirmed and I am so looking forward to it! If anything changes before then, just reply to this email.</p>\n<p>See you soon,<br>{{studio_name}}</p>",
  { subject: "Your booking is confirmed — {{event_date}}" }, 0);
addTpl("email_snippet", "Gallery delivery note",
  "<p>Hi {{client_name}},</p>\n<p>your gallery is ready! View and favorite your images here: {{gallery_link}}</p>\n<p>The gallery stays open for 90 days — download your favorites before then.</p>\n<p>Enjoy,<br>{{studio_name}}</p>",
  { subject: "Your photos are ready 🎉" }, 0);
addTpl("invoice_preset", "Standard terms", "[]", { terms: "Payment due within 14 days of the invoice date.", notes: "Thank you for your business!" }, 1);
addTpl("invoice_preset", "Wedding Collection", [
  { description: "Full-day wedding coverage (8 hours)", qty: 1, amountMinor: 280000 },
  { description: "Second photographer", qty: 1, amountMinor: 45000 },
  { description: "Album credit", qty: 1, amountMinor: 30000 },
]);
addTpl("invoice_preset", "Portrait Session", [
  { description: "60-minute portrait session", qty: 1, amountMinor: 25000 },
  { description: "Extra retouched image set (10)", qty: 1, amountMinor: 7500 },
]);
addTpl("invoice_preset", "Mini Session", [{ description: "20-minute mini session", qty: 1, amountMinor: 12500 }]);
addTpl("contract_clause", "Image usage & licensing", "All images remain the copyright of the studio. The client receives a personal-use license covering printing, sharing and archiving; commercial use, third-party licensing or AI training requires separate written permission.");
addTpl("contract_clause", "Weather policy", "If conditions make outdoor photography unsafe or unreasonably difficult, the studio and client will agree on a new date within 60 days at no additional charge.");
addTpl("contract_clause", "Retainer non-refundable", "The retainer reserves the date exclusively and is non-refundable, though it may be transferred once to a new date if the client reschedules at least 30 days in advance.");
addTpl("contract_clause", "Delivery timeline", "Edited images are delivered through a private online gallery within six weeks of the session date. Sneak peeks may arrive sooner at the studio's discretion.");
addTpl("contract_clause", "Cancellation by studio", "If the studio cannot attend due to illness, emergency or force majeure, all payments made will be refunded in full within 10 business days, or a comparable replacement photographer may be offered.");
addTpl("questionnaire", "Client questionnaire", {
  v: 1, title: "A few questions", intro: "Your answers help us plan the session perfectly.", thankYou: "Thank you — your answers are in!",
  fields: [
    { id: "f_name", kind: "text", label: "Your name", required: true, half: true },
    { id: "f_email", kind: "email", label: "Email", required: true, half: true },
    { id: "f_phone", kind: "phone", label: "Best phone for day-of", required: false, half: true },
    { id: "f_date", kind: "date", label: "Session date (if set)", required: false, half: true },
    { id: "f_venue", kind: "text", label: "Venue / location", required: false, help: "Address or name of the place", half: true },
    { id: "f_arrival", kind: "text", label: "Who should we ask for on arrival?", required: false, half: true },
    { id: "f_style", kind: "select", label: "Which photos matter most?", required: false, options: ["Candids + in-between moments", "Formal groupings", "Couple portraits", "Detail shots", "A mix of everything"] },
    { id: "f_must", kind: "textarea", label: "Any must-have shots?", required: false, help: "Family groupings, heirlooms, pets — anything that simply can't be missed" },
    { id: "f_notes", kind: "textarea", label: "Anything else we should know?", required: false },
  ],
}, {}, 1);
/* WEB-258 starter gallery presets (v1 design configs). */
addTpl("gallery_preset", "Editorial dark", {
  cover: { assetId: "", focal: { x: 0.5, y: 0.4 }, style: "kenburns", title: "{{client_name}}", subtitle: "A film from your day with {{studio_name}}" },
  layout: "cascade",
  theme: { background: "dark", padding: "normal", radius: "0px", captions: "hover" },
});
addTpl("gallery_preset", "Clean light", {
  cover: { assetId: "", focal: { x: 0.5, y: 0.5 }, style: "static", title: "Your photos are ready", subtitle: "for {{client_name}} · {{event_date}}" },
  layout: "grid",
  theme: { background: "light", padding: "normal", radius: "16px", captions: "off" },
});
addTpl("gallery_preset", "Brand story", {
  cover: { assetId: "", focal: { x: 0.5, y: 0.35 }, style: "split", title: "{{client_name}}", subtitle: "captured by {{studio_name}}" },
  layout: "masonry",
  theme: { background: "brand", padding: "airy", radius: "8px", captions: "hover" },
});
insert("template", ["id", "organization_id", "kind", "name", "body", "meta", "is_default", "created_at", "updated_at"], tpl);

/* ======================================================================= *
 * WRITE + APPLY + UPLOAD + VERIFY
 * ======================================================================= */
const sqlPath = join(here, ".demo-seed.sql");
writeFileSync(sqlPath, stmts.join("\n") + "\n", "utf8");
console.log(`[seed] ${stmts.length} statements -> ${sqlPath}`);
if (process.argv.includes("--emit-only")) {
  console.log("[seed] --emit-only: SQL written, nothing applied. Dry-run it with:");
  console.log(`  python - <<'PY'  (migrations + seed into :memory:, FKs on)`);
  process.exit(0);
}

const run = async (args, label) => {
  try {
    const { stdout, stderr } = await execFile("npx", args, { cwd: appRoot, shell: process.platform === "win32", maxBuffer: 32 * 1024 * 1024 });
    return (stdout || "") + (stderr ? `\n${stderr}` : "");
  } catch (err) {
    console.error(`[seed] FAILED at ${label}:`);
    console.error((err.stdout || "") + (err.stderr || "") || err.message);
    process.exit(1);
  }
};

/* 1 — D1 apply (idempotent: the file starts with the DELETEs). */
console.log(`[seed] applying to D1 ${DB_NAME} (--remote)…`);
await run(["wrangler", "d1", "execute", DB_NAME, "--remote", "--file", sqlPath, "-y"], "d1 execute");
console.log(`[seed] D1 applied.`);

/* 2 — R2 uploads (overwrite same fixed keys on re-runs). */
console.log(`[seed] uploading ${uploads.length} objects to R2 ${BUCKET} (--remote)…`);
for (let i = 0; i < uploads.length; i++) {
  const u = uploads[i];
  await run(["wrangler", "r2", "object", "put", `${BUCKET}/${u.key}`, "--file", u.file, "--remote", "--content-type", "image/jpeg"], `r2 put ${u.key}`);
  if ((i + 1) % 12 === 0 || i === uploads.length - 1) console.log(`  [r2] ${i + 1}/${uploads.length}`);
}

/* 3 — verify (single-line SQL; runs through a shell string because
 * execFile+shell concatenation mangles spaced --command args on Windows). */
const q = async (sql) => {
  if (sql.includes('"')) throw new Error("verify SQL must not contain double quotes");
  let out;
  try {
    const r = await execShell(`npx wrangler d1 execute ${DB_NAME} --remote --json -y --command "${sql}"`, { cwd: appRoot, maxBuffer: 32 * 1024 * 1024 });
    out = r.stdout;
  } catch (err) {
    console.error(`[seed] FAILED at verify: ${(err.stdout || "") + (err.stderr || "") || err.message}`);
    process.exit(1);
  }
  const m = out.match(/\[[\s\S]*\]/);
  if (!m) return out;
  try {
    return JSON.parse(m[0])[0]?.results ?? m[0];
  } catch {
    return m[0];
  }
};
const O = `'${ORG_ID}'`;
const v1 = await q(`SELECT (SELECT COUNT(*) FROM user WHERE id='${USER_ID}') AS users, (SELECT COUNT(*) FROM organization WHERE id=${O}) AS orgs, (SELECT COUNT(*) FROM member WHERE organization_id=${O}) AS members, (SELECT COUNT(*) FROM studio_profile WHERE organization_id=${O}) AS profiles, (SELECT COUNT(*) FROM session_type WHERE organization_id=${O}) AS session_types, (SELECT COUNT(*) FROM availability_rule WHERE organization_id=${O}) AS avail_rules, (SELECT COUNT(*) FROM client WHERE organization_id=${O}) AS clients, (SELECT COUNT(*) FROM lead WHERE organization_id=${O}) AS leads, (SELECT COUNT(*) FROM lead_message WHERE organization_id=${O}) AS lead_msgs`);
const v2 = await q(`SELECT (SELECT COUNT(*) FROM project WHERE organization_id=${O}) AS projects, (SELECT COUNT(*) FROM folder WHERE organization_id=${O}) AS folders, (SELECT COUNT(*) FROM asset WHERE organization_id=${O}) AS assets, (SELECT COUNT(*) FROM share_grant WHERE organization_id=${O}) AS grants, (SELECT COUNT(*) FROM share_grant_asset WHERE grant_id='${GRANT_ID}') AS grant_assets, (SELECT COUNT(*) FROM favorite_list WHERE organization_id=${O}) AS fav_lists, (SELECT COUNT(*) FROM gallery_favorite WHERE organization_id=${O}) AS favorites, (SELECT COUNT(*) FROM gallery_favorite WHERE organization_id=${O} AND note IS NOT NULL) AS fav_notes`);
const v3 = await q(`SELECT (SELECT COUNT(*) FROM invoice WHERE organization_id=${O}) AS invoices, (SELECT COUNT(*) FROM payment WHERE organization_id=${O}) AS payments, (SELECT COUNT(*) FROM contract WHERE organization_id=${O}) AS contracts, (SELECT COUNT(*) FROM template WHERE organization_id=${O}) AS templates, (SELECT COUNT(*) FROM booking WHERE organization_id=${O}) AS bookings, (SELECT COUNT(*) FROM thread WHERE organization_id=${O}) AS threads, (SELECT COUNT(*) FROM thread_message WHERE organization_id=${O}) AS thread_msgs, (SELECT COUNT(*) FROM inbox_item WHERE organization_id=${O}) AS inbox_items, (SELECT COUNT(*) FROM project WHERE organization_id=${O} AND gallery_design IS NOT NULL) AS designed_projects`);
console.log("[verify] identity+leads:   ", JSON.stringify(v1));
console.log("[verify] projects+gallery: ", JSON.stringify(v2));
console.log("[verify] money+inbox:      ", JSON.stringify(v3));

/* 4 — summary */
const money = (n) => `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
console.log(`
────────────────────────────────────────────────────────────────
  STAGING DEMO SEEDED — ${STUDIO.name}
  org ${ORG_ID} · plan studio · ${clients.length} clients · ${leads.length} leads ·
  ${projects.length} projects · ${assetRows.length} assets (+${uploads.length} R2 objects) ·
  ${invoices.length} invoices (${money(invoices[0].total)} paid / ${money(invoices[1].total)} open / ${money(invoices[2].total)} overdue) ·
  ${contracts.length} contracts · ${tpl.length} templates · ${bookings.length} bookings

  LOGIN (dashboard)
    ${APP_URL}/login
    email:    ${STUDIO.email}
    password: TestPass123!x

  CLIENT GALLERY (favorites on, downloads allowed)
    ${APP_URL}/p/${GALLERY_TOKEN}

  CONTRACT AWAITING SIGNATURE (family session)
    ${APP_URL}/c/${CONTRACT_TOKEN}

  PUBLIC BOOKING PAGE
    ${APP_URL}/b/${ORG_SLUG}
────────────────────────────────────────────────────────────────`);
