#!/usr/bin/env bash
# WEBC-104: seed the local recording target's demo org (dev server on :5173).
# Recreates the full demo state after a wiped .wrangler/state: applies local
# migrations if the DB is empty, creates the studio through the app's own
# signup + onboarding endpoint (so the org id is whatever this install mints —
# never hardcoded), then seeds the take-fixture demo rows: client Nora Example,
# the Willow Creek wedding project, and the 10 wedding photos copied from the
# staging bucket under the LOCAL org's key prefix (assets-serving validates
# that storage keys start with the org id).
#
# Usage: dev server must already be running (node_modules/.bin/vinext dev
# --port 5173). Login credentials end up in the local DB:
#   amara-local@webcules.com / LocalReel-2026!x   (throwaway, local-only)
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${TARGET_BASE:-http://localhost:5173}"
LOCAL_EMAIL="amara-local@webcules.com"
LOCAL_PASSWORD="LocalReel-2026!x"
STAGING_ORG="6b1f4c2e-8a3d-4e57-9c21-b0f8d3a4e5c1"
W() { node_modules/.bin/wrangler "$@"; }
Q() { W d1 execute webcules-snap --local --command "$1" --json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.stringify(JSON.parse(d)[0].results))})"; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 0. dev server must be reachable (signup + onboarding go through the app).
curl -sf -o /dev/null "$BASE/" || { echo "ERROR: $BASE is not up — start it with: node_modules/.bin/vinext dev --port 5173"; exit 1; }

# 1. apply local migrations if the DB is fresh (later ALTERs would fail on a
# partially-migrated DB, so only run the loop when organization is missing).
ORG_TABLE=$(Q "SELECT name FROM sqlite_master WHERE type='table' AND name='organization'" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).length ? 'yes':'no')})")
if [ "$ORG_TABLE" != "yes" ]; then
  echo "fresh local DB — applying migrations..."
  for f in migrations/*.sql; do W d1 execute webcules-snap --local --file "$f" >/dev/null; done
  echo "migrations applied."
fi

# 2. create the studio through the app (skips silently if it already exists).
if [ "$(Q "SELECT COUNT(*) AS n FROM organization" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d)[0].n)})")" = "0" ]; then
  curl -sf -c "$TMP/ck.txt" -X POST "$BASE/api/auth/sign-up/email" -H "content-type: application/json" -H "origin: $BASE" \
    -d "{\"email\":\"$LOCAL_EMAIL\",\"password\":\"$LOCAL_PASSWORD\",\"name\":\"Amara Osei\"}" >/dev/null
  curl -sf -b "$TMP/ck.txt" -X POST "$BASE/api/studio" -H "content-type: application/json" -H "origin: $BASE" \
    -d '{"studioName":"Amara & Oak Photography","timezone":"America/Chicago","contactEmail":"amara-local@webcules.com"}' >/dev/null
  echo "studio created via onboarding."
else
  echo "org already exists — leaving it in place."
fi

ORG=$(Q "SELECT id FROM organization LIMIT 1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d)[0]?.id ?? '')})")
[ -n "$ORG" ] || { echo "ERROR: no organization found after setup"; exit 1; }
echo "seeding into org: $ORG"

# 3. demo client + project (take-fixture constants; idempotent).
Q "INSERT INTO client (id, organization_id, email, name) VALUES ('demo-cli-nora', '$ORG', 'client@example.com', 'Nora Example')" >/dev/null 2>&1 || echo "(client already present)"
Q "INSERT INTO project (id, organization_id, client_id, title, status) VALUES ('demo-proj-wedding', '$ORG', 'demo-cli-nora', 'Daniel & Priya — Willow Creek Estate Wedding', 'booked')" >/dev/null 2>&1 || echo "(project already present)"

# 4. asset rows + R2 objects, keys re-prefixed to the local org.
W d1 execute webcules-snap-staging --remote --command "SELECT id, storage_key, thumb_key, preview_key, mime_type, bytes, width, height, filename, kind FROM asset WHERE project_id='demo-proj-wedding' ORDER BY id" --json 2>/dev/null \
| node -e "let d='';const fs=require('fs');process.stdin.on('data',c=>d+=c).on('end',()=>{fs.writeFileSync('$TMP/wedding_assets.json',JSON.stringify(JSON.parse(d)[0].results))})"

ORG="$ORG" STAGING_ORG="$STAGING_ORG" TMP="$TMP" node - <<'EOF'
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.env.TMP + "/wedding_assets.json", "utf8"));
const ORG = process.env.ORG, STAGING_ORG = process.env.STAGING_ORG;
const ren = (k) => k.replace(STAGING_ORG, ORG);
const esc = (s) => (s ?? "").replace(/'/g, "''");
fs.writeFileSync(process.env.TMP + "/seed_assets.sql", rows.map((a) =>
  `INSERT OR IGNORE INTO asset (id, organization_id, project_id, storage_key, kind, filename, mime_type, bytes, width, height, status, thumb_key, preview_key, created_at) VALUES ('${a.id}','${ORG}','demo-proj-wedding','${ren(a.storage_key)}','${esc(a.kind)}','${esc(a.filename)}','${esc(a.mime_type)}',${a.bytes},${a.width ?? "NULL"},${a.height ?? "NULL"},'shared','${ren(a.thumb_key)}','${ren(a.preview_key)}',unixepoch());`
).join("\n") + "\n");
fs.writeFileSync(process.env.TMP + "/r2_copy_list.txt", rows.flatMap((a) => [
  `${a.storage_key}\t${ren(a.storage_key)}`,
  `${a.thumb_key}\t${ren(a.thumb_key)}`,
  `${a.preview_key}\t${ren(a.preview_key)}`,
]).join("\n") + "\n");
console.log("asset rows:", rows.length, "R2 objects:", rows.length * 3);
EOF

W d1 execute webcules-snap --local --file "$TMP/seed_assets.sql" --json >/dev/null 2>&1 && echo "asset rows seeded" || { echo "asset seed FAILED"; exit 1; }

ok=0; bad=0
while IFS=$'\t' read -r src dst <&3; do
  if W r2 object get "snap-staging/$src" --file "$TMP/obj" --remote >/dev/null 2>&1 <&3 \
     && W r2 object put "snap-webcules/$dst" --file "$TMP/obj" --local >/dev/null 2>&1 <&3; then
    ok=$((ok+1))
  else
    bad=$((bad+1)); echo "R2 FAIL: $src"
  fi
done 3< "$TMP/r2_copy_list.txt"
echo "R2 objects copied: $ok ok, $bad failed"
[ "$bad" -eq 0 ] || exit 1

echo "done. verify with: node scripts/verify_local_target.mjs"
