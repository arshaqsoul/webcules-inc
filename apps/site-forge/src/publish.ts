import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fetchWithTimeout, flagStr, log, projectOrDie, type Args } from "./util.ts";

function sh(cmd: string, argsArr: string[], cwd: string, opts: { okCodes?: number[] } = {}) {
  // shell:true means WE own quoting — without it cmd.exe breaks on spaces/parens in args
  const line = [cmd, ...argsArr]
    .map((a) => (/[\s"&'()<>|^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a))
    .join(" ");
  const r = spawnSync(line, { cwd, shell: true, encoding: "utf8" });
  const ok = r.status === 0 || (opts.okCodes ?? []).includes(r.status ?? -1);
  return { ok, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

async function githubLogin(): Promise<string | null> {
  if (process.env.GITHUB_TOKEN) {
    const r = await fetchWithTimeout("https://api.github.com/user", { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "User-Agent": "site-forge", Accept: "application/vnd.github+json" } });
    if (r.ok) { const j: any = await r.json(); return j.login; }
  }
  const gh = sh("gh", ["auth", "status", "-t"], process.cwd());
  if (gh.ok) {
    const m = gh.out.match(/account (\S+)/);
    if (m) return m[1]!;
  }
  return null;
}

export async function cmdPublish(args: Args) {
  const projectDir = projectOrDie(flagStr(args, "project", "p"));
  const cfg = fs.existsSync(path.join(projectDir, "forge.config.json"))
    ? JSON.parse(fs.readFileSync(path.join(projectDir, "forge.config.json"), "utf8"))
    : { name: path.basename(projectDir) };
  const repoName = flagStr(args, "repo") ?? cfg.name;
  const isPrivate = args.flags.public !== true;
  const message = flagStr(args, "message", "m") ?? "feat: initial site (generated with site-forge)";

  // git identity check
  const who = sh("git", ["config", "user.name"], projectDir);
  if (!who.ok || !who.out.trim()) {
    log.warn("git user.name is not configured — set it once globally:");
    console.log("  git config --global user.name \"Your Name\"\n  git config --global user.email \"you@example.com\"");
  }

  // init repo if needed — rev-parse exits 128 with "false" output outside a repo
  const inside = sh("git", ["rev-parse", "--is-inside-work-tree"], projectDir, { okCodes: [128] });
  if (!inside.ok || !inside.out.trim().startsWith("true")) {
    sh("git", ["init", "-b", "main"], projectDir);
    log.ok("git repository initialized (branch main)");
  }
  sh("git", ["add", "-A"], projectDir);
  const commit = sh("git", ["commit", "-m", message], projectDir, { okCodes: [1] });
  if (commit.out.includes("nothing to commit")) log.info("nothing new to commit");
  else log.ok(`committed: ${message}`);

  const remote = sh("git", ["remote", "get-url", "origin"], projectDir, { okCodes: [1, 128] });
  let remoteUrl = remote.ok ? remote.out.trim() : null;

  const login = await githubLogin();
  if (remoteUrl) {
    log.info(`remote already set: ${remoteUrl}`);
  } else if (login) {
    // create the repo (gh first, then API token)
    const visibility = isPrivate ? "--private" : "--public";
    const ghCreate = sh("gh", ["repo", "create", repoName, visibility, "--description", String(cfg.description ?? "")], projectDir, { okCodes: [1] });
    if (!ghCreate.ok) {
      if (process.env.GITHUB_TOKEN) {
        const r = await fetchWithTimeout("https://api.github.com/user/repos", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "User-Agent": "site-forge", "Content-Type": "application/json", Accept: "application/vnd.github+json" },
          body: JSON.stringify({ name: repoName, private: isPrivate, description: cfg.description ?? "" }),
        });
        if (!r.ok) log.warn(`GitHub API could not create repo (${r.status}) — creating manually may be needed`);
      } else {
        log.warn(`could not create repo automatically (${ghCreate.out.trim().split("\n")[0]})`);
      }
    }
    remoteUrl = `https://github.com/${login}/${repoName}.git`;
    sh("git", ["remote", "add", "origin", remoteUrl], projectDir);
    log.ok(`remote → ${remoteUrl}`);
  } else {
    console.log(`
${log.bold("Manual publish")} (no gh CLI / GITHUB_TOKEN found):
  1. create a ${isPrivate ? "private " : ""}repo named ${log.bold(repoName)}: https://github.com/new
  2. cd ${projectDir}
     git remote add origin https://github.com/<you>/${repoName}.git
     git push -u origin main
  (or install gh: winget install GitHub.cli && gh auth login, then re-run forge publish)`);
    return;
  }

  const push = sh("git", ["push", "-u", "origin", "main"], projectDir);
  if (push.ok) log.ok(`pushed → ${remoteUrl.replace(".git", "")} (${isPrivate ? "private" : "public"})`);
  else {
    log.err("push failed:");
    console.log(push.out.trim());
  }
}
