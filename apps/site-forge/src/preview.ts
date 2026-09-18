import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { die, flagStr, log, projectOrDie, type Args } from "./util.ts";

function run(cmd: string, argsArr: string[], cwd: string, envExtra: Record<string, string> = {}) {
  const r = spawnSync(cmd, argsArr, { cwd, stdio: "inherit", shell: true, env: { ...process.env, ...envExtra } });
  if (r.status !== 0) die(`\`${cmd} ${argsArr.join(" ")}\` exited with ${r.status}`);
  return r;
}

export async function cmdPreview(args: Args) {
  const projectDir = projectOrDie(flagStr(args, "project", "p"));
  if (!fs.existsSync(path.join(projectDir, "node_modules"))) {
    log.info("installing dependencies first…");
    run("pnpm", ["install"], projectDir);
  }
  const port = flagStr(args, "port") ?? "4321";
  log.info(`dev server → http://localhost:${port}  (Ctrl+C to stop)`);
  run("pnpm", ["dev", "--host", "--port", port], projectDir);
}

export async function cmdBuild(args: Args) {
  const projectDir = projectOrDie(flagStr(args, "project", "p"));
  run("pnpm", ["install"], projectDir);
  run("pnpm", ["build"], projectDir);
  log.ok(`built → ${path.join(projectDir, "dist")}`);
}

export async function cmdDeploy(args: Args) {
  const projectDir = projectOrDie(flagStr(args, "project", "p"));
  const who = spawnSync("npx", ["wrangler", "whoami"], { cwd: projectDir, shell: true, encoding: "utf8" });
  if ((who.status ?? 1) !== 0) {
    die(
      "wrangler is not authenticated with Cloudflare.",
      `run:  cd ${projectDir} && npx wrangler login   (opens browser, one time)`
    );
  }
  run("pnpm", ["install"], projectDir);
  run("pnpm", ["build"], projectDir);
  log.info("deploying to Cloudflare Workers…");
  run("npx", ["wrangler", "deploy"], projectDir);
  log.ok("deployed. first deploy: pick a workers.dev subdomain if prompted.");
}
