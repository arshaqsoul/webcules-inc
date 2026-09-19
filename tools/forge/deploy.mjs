/* pnpm forge:deploy
 * Guarded production deploy for the landing app (component library included):
 *   1. refuses to deploy if any APPROVED standard component is missing its
 *      registry JSON (code would silently not be CLI-installable)
 *   2. refuses to deploy if a PREMIUM component HAS a registry JSON (code leak)
 *   3. runs the landing deploy (registry:build → next build → fix-worker → wrangler) */
import {
  log, die, readLibrary, existsSync, run, join, LANDING, REGISTRY_DIR,
} from "./lib/common.mjs";

const lib = readLibrary();
const approved = lib.components.filter((c) => c.phase === "approved");

for (const c of approved) {
  const reg = join(REGISTRY_DIR, `${c.name}.json`);
  const has = existsSync(reg);
  if (!c.premium && !has)
    die(`standard component "${c.name}" has no registry file`,
        `run: pnpm forge:approve ${c.name}`);
  if (c.premium && has)
    die(`premium component "${c.name}" still has a registry file (code leak!)`,
        `run: pnpm forge:approve ${c.name} --premium`);
}

log.info(`deploying ${approved.length} approved component(s) → webcules.com`);
process.chdir(LANDING);
const ok = run("pnpm", ["run", "deploy"]);
if (!ok) die("deploy failed — see output above");
log.ok("deployed. verify: https://webcules.com/components");
