import io, re

def gate_api(path, permission, anchor):
    """Insert a role gate right after the getOrgContext null-check."""
    s = io.open(path, encoding="utf-8").read()
    if "permissionDenied" in s:
        print("skip (gated)", path); return
    assert s.count(anchor) == 1, f"{path}: anchor not found"
    s = s.replace(anchor, anchor + f"""
  // WEB-275: role gate.
  const denied = permissionDenied(ctx, "{permission}");
  if (denied) return denied;""")
    # add import after the session import
    m = re.search(r'import \{ getOrgContext \} from "@/lib/session";', s)
    assert m, f"{path}: session import missing"
    s = s.replace('import { getOrgContext } from "@/lib/session";',
                  'import { getOrgContext } from "@/lib/session";\nimport { permissionDenied } from "@/lib/permissions";', 1)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    print("ok", path)

# settings writes (admin+)
gate_api("app/api/studio/brand/route.ts", "settings.write", "  const ctx = await getOrgContext();\n  if (!ctx) return Response.json({ error: \"unauthorized\" }, { status: 401 });")
# billing (owner)
gate_api("app/api/studio/plan/route.ts", "billing.write", "  const ctx = await getOrgContext();")
gate_api("app/api/studio/plan/portal/route.ts", "billing.write", "  const ctx = await getOrgContext();")
gate_api("app/api/studio/payouts/route.ts", "billing.write", "  const ctx = await getOrgContext();")
gate_api("app/api/studio/payouts/express-login/route.ts", "billing.write", "  const ctx = await getOrgContext();")
# documents (admin+): invoice send + contract create
gate_api("app/api/invoices/[id]/action/route.ts", "documents.manage", "  const ctx = await getOrgContext();")
gate_api("app/api/projects/[id]/contracts/route.ts", "documents.manage", "  const ctx = await getOrgContext();")
print("api gates done")
