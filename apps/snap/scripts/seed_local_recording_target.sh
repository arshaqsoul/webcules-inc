#!/usr/bin/env bash
# WEBC-104: seed the local recording target's demo org (dev server on :5173).
# Client + project rows re-use the take-fixture constants; the 10 wedding
# assets are copied from the staging bucket under the LOCAL org's key prefix
# (assets-serving validates that storage keys start with the org id).
set -uo pipefail
cd "$(dirname "$0")/.."

ORG=30d3b874-2c47-46b1-a79c-627b09936691
STAGING_ORG=6b1f4c2e-8a3d-4e57-9c21-b0f8d3a4e5c1
W() { node_modules/.bin/wrangler "$@"; }

# Pull the wedding asset rows from staging (source of truth for keys/bytes).
W d1 execute webcules-snap-staging --remote --command "SELECT id, storage_key, thumb_key, preview_key, mime_type, bytes, width, height, filename, kind FROM asset WHERE project_id='demo-proj-wedding' ORDER BY id" --json 2>/dev/null | node -e "let d='';const fs=require('fs');process.stdin.on('data',c=>d+=c).on('end',()=>{fs.writeFileSync('/tmp/wedding_assets.json',JSON.stringify(JSON.parse(d)[0].results))})" 2>/dev/null || true

W d1 execute webcules-snap --local --command "INSERT INTO client (id, organization_id, email, name) VALUES ('demo-cli-nora', '$ORG', 'client@example.com', 'Nora Example')" --json >/dev/null 2>&1 || echo "client insert (maybe exists)"
W d1 execute webcules-snap --local --command "INSERT INTO project (id, organization_id, client_id, title, status) VALUES ('demo-proj-wedding', '$ORG', 'demo-cli-nora', 'Daniel & Priya — Willow Creek Estate Wedding', 'booked')" --json >/dev/null 2>&1 || echo "project insert (maybe exists)"

node - <<'EOF'
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync("/tmp/wedding_assets.json", "utf8"));
const ORG = "30d3b874-2c47-46b1-a79c-627b09936691";
const STAGING_ORG = "6b1f4c2e-8a3d-4e57-9c21-b0f8d3a4e5c1";
const ren = (k) => k.replace(STAGING_ORG, ORG);
const lines = rows.map((a) => {
  const esc = (s) => (s ?? "").replace(/'/g, "''");
  return `INSERT INTO asset (id, organization_id, project_id, storage_key, kind, filename, mime_type, bytes, width, height, status, thumb_key, preview_key, created_at) VALUES ('${a.id}','${ORG}','demo-proj-wedding','${ren(a.storage_key)}','${esc(a.kind)}','${esc(a.filename)}','${esc(a.mime_type)}',${a.bytes},${a.width ?? "NULL"},${a.height ?? "NULL"},'shared','${ren(a.thumb_key)}','${ren(a.preview_key)}',unixepoch());`;
});
fs.writeFileSync("/tmp/seed_assets.sql", lines.join("\n") + "\n");
fs.writeFileSync("/tmp/r2_copy_list.txt", rows.flatMap((a) => [
  `${a.storage_key}\t${ren(a.storage_key)}`,
  `${a.thumb_key}\t${ren(a.thumb_key)}`,
  `${a.preview_key}\t${ren(a.preview_key)}`,
]).join("\n") + "\n");
console.log("rows:", rows.length, "objects:", rows.length * 3);
EOF

W d1 execute webcules-snap --local --file /tmp/seed_assets.sql --json >/dev/null 2>&1 && echo "asset rows seeded" || echo "asset seed FAILED"

mkdir -p /home/arsha/multica_workspaces_desktop-api.multica.ai/webcules-5ad313fa3874/webc-104-8152d2588f3d/hermes-home/cache/scratch/r2copy
ok=0; bad=0
while IFS=$'\t' read -r src dst; do
  f=/home/arsha/multica_workspaces_desktop-api.multica.ai/webcules-5ad313fa3874/webc-104-8152d2588f3d/hermes-home/cache/scratch/r2copy/obj
  if W r2 object get "snap-staging/$src" --file "$f" --remote >/dev/null 2>&1 \
     && W r2 object put "snap-webcules/$dst" --file "$f" --local >/dev/null 2>&1; then
    ok=$((ok+1))
  else
    bad=$((bad+1)); echo "R2 FAIL: $src"
  fi
done < /tmp/r2_copy_list.txt
echo "R2 objects copied: $ok ok, $bad failed"
rm -rf /home/arsha/multica_workspaces_desktop-api.multica.ai/webcules-5ad313fa3874/webc-104-8152d2588f3d/hermes-home/cache/scratch/r2copy
