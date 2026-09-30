/* POST /api/studio/import — WEB-276 clients/leads CSV import. The browser
 * parses + maps (pure lib/csv-import) and posts the raw rows + mapping; the
 * server re-shapes and re-validates — the client is never authority. Rows
 * are chunked for D1; a batch id on every created row powers 7-day undo. */
import { getOrgContext } from "@/lib/session";
import { permissionDenied } from "@/lib/permissions";
import { claimThrottleGate } from "@/lib/system-state";
import { guessMapping, shapeRows, IMPORT_MAX_ROWS } from "@/lib/csv-import";
import { runImport, type ImportKind } from "@/lib/repos/import";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  if (!(await claimThrottleGate(`import.${ctx.organizationId}`, 30))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: {
    kind?: string;
    dryRun?: boolean;
    updateBlanks?: boolean;
    mapping?: Record<string, number>;
    rows?: string[][];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const kind: ImportKind = body.kind === "clients" ? "clients" : "leads";
  if (!Array.isArray(body.rows) || body.rows.length < 1) {
    return Response.json({ error: "no_rows" }, { status: 400 });
  }
  if (body.rows.length > IMPORT_MAX_ROWS) {
    return Response.json({ error: "too_many_rows" }, { status: 400 });
  }

  // Server-side mapping: trust the client's column picks only in shape.
  const first = body.rows[0] ?? [];
  const mapping = { ...guessMapping(first.map((_, i) => String(i))) }; // never used directly — see below
  void mapping;
  // The client sends its mapping (validated as index numbers) — fall back to
  // a fresh guess on the header row the client re-sends as rows[0] is NOT
  // included; header comes via mapping keys referencing the ORIGINAL file.
  // We re-shape with the provided mapping; indices are bounds-checked.
  const safeMapping: Record<string, number> = {};
  for (const [field, idx] of Object.entries(body.mapping ?? {})) {
    if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < 200) safeMapping[field] = idx;
  }
  if (safeMapping.email === undefined) {
    return Response.json({ error: "email_unmapped" }, { status: 400 });
  }

  const { shaped, errors } = shapeRows(body.rows, safeMapping);
  if (!shaped.length && !errors.length) {
    return Response.json({ error: "no_rows" }, { status: 400 });
  }

  try {
    const report = await runImport({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      kind,
      rows: shaped,
      dryRun: body.dryRun === true,
      updateBlanks: body.updateBlanks === true,
    });
    return Response.json(report);
  } catch (err) {
    console.error("import failed:", String(err));
    return Response.json({ error: "import_failed" }, { status: 500 });
  }
}
