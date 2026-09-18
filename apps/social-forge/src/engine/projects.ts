import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureDir, nowIso, projPath, PROJECTS_ROOT, readJson, readJsonSafe, slugify, writeJson } from "./util.ts";
import type { Post, PostStatus, ProjectManifest } from "./types.ts";

const exec = promisify(execFile);

/** git helpers — every mutation on a project is committed to its own repo. */
export async function git(projRoot: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", projRoot, ...args], { maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

export async function commitProject(slug: string, message: string): Promise<string | null> {
  const root = projPath(slug);
  if (!fs.existsSync(path.join(root, ".git"))) return null;
  try {
    await git(root, "add", "-A");
    const status = await git(root, "status", "--porcelain");
    if (!status) return null; // nothing to commit
    await git(root, "commit", "-m", message, "--quiet");
    return await git(root, "log", "-1", "--format=%h");
  } catch (e: any) {
    console.error(`[social-forge] git commit failed for ${slug}: ${e.message}`);
    return null;
  }
}

export function listProjects(): ProjectManifest[] {
  if (!fs.existsSync(PROJECTS_ROOT)) return [];
  return fs
    .readdirSync(PROJECTS_ROOT)
    .map((slug) => {
      const mf = path.join(PROJECTS_ROOT, slug, "marketing.json");
      if (!fs.existsSync(mf)) return null;
      try {
        return readJson(mf) as ProjectManifest;
      } catch {
        return null;
      }
    })
    .filter((p): p is ProjectManifest => !!p)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getProject(slug: string): ProjectManifest | null {
  const mf = projPath(slug, "marketing.json");
  if (!fs.existsSync(mf)) return null;
  try {
    return readJson(mf) as ProjectManifest;
  } catch {
    return null;
  }
}

export function touchManifest(slug: string): ProjectManifest {
  const mf = getProject(slug)!;
  mf.updatedAt = nowIso();
  writeJson(projPath(slug, "marketing.json"), mf);
  return mf;
}

const DEFAULT_BRAND = {
  business: "Webcules",
  accent: "#6C5CE7",
  accent2: "#00CEC9",
  dark: "#12121C",
  light: "#FFFFFF",
  fontDisplay: "Segoe UI Black",
  fontBody: "Segoe UI",
};

export function createProject(input: {
  name: string;
  brief: string;
  tone?: string;
  platforms?: string[];
  brand?: Partial<typeof DEFAULT_BRAND>;
  offer?: Partial<ProjectManifest["offer"]>;
}): { slug: string; manifest: ProjectManifest } {
  const slug = slugify(input.name);
  if (!slug) throw new Error("Project name produced an empty slug");
  const root = projPath(slug);
  if (fs.existsSync(root)) throw new Error(`Project already exists: webcules/projects/${slug}`);
  ensureDir(root);

  const manifest: ProjectManifest = {
    schema: "social-forge/project@1",
    slug,
    name: input.name.trim(),
    brief: input.brief.trim(),
    tone: input.tone?.trim() || "confident, direct, zero fluff — a senior agency talking to a smart buyer",
    platforms: (input.platforms?.length ? input.platforms : ["facebook", "instagram", "tiktok", "linkedin", "whatsapp"]) as ProjectManifest["platforms"],
    brand: { ...DEFAULT_BRAND, ...input.brand },
    offer: {
      product: "custom apps & websites, built for your business",
      promise: "We design and build the exact app or site your business needs — and you own it.",
      audience: "small & mid-size business owners who've outgrown templates and spreadsheets",
      pains: [
        "locked into template builders that all look the same",
        "running operations out of WhatsApp chats, DMs and spreadsheets",
        "paying for SaaS tools that almost fit — but never quite",
      ],
      proofs: ["fixed scope, fixed timeline, no surprise invoices", "you own the code — no hostage hosting", "built by Webcules, shipped end-to-end"],
      ctaLabel: "Get a custom app built",
      ...input.offer,
    } as ProjectManifest["offer"],
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  // Organized per-project file system: swipe / workflows / assets / posts
  for (const d of ["swipe", "workflows", "assets/images", "assets/videos", "assets/raw", "assets/swipe", "posts"]) ensureDir(path.join(root, d));
  writeJson(path.join(root, "marketing.json"), manifest);
  fs.writeFileSync(
    path.join(root, "brief.md"),
    `# ${manifest.name}\n\n${manifest.brief}\n\n## Offer\n\n- **Product:** ${manifest.offer.product}\n- **Promise:** ${manifest.offer.promise}\n- **Audience:** ${manifest.offer.audience}\n- **Tone:** ${manifest.tone}\n\n## Pains we speak to\n\n${manifest.offer.pains.map((p) => `- ${p}`).join("\n")}\n\n## Proof\n\n${manifest.offer.proofs.map((p) => `- ${p}`).join("\n")}\n`,
  );
  for (const f of ["facebook", "instagram", "tiktok", "linkedin", "whatsapp", "visual"]) writeJson(path.join(root, "swipe", `${f}.json`), []);
  writeJson(path.join(root, "workflows", "runs.json"), []);
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n.DS_Store\n");

  return { slug, manifest };
}

export async function initProjectRepo(slug: string): Promise<void> {
  const root = projPath(slug);
  if (!fs.existsSync(path.join(root, ".git"))) {
    await git(root, "init", "-b", "main").catch(() => git(root, "init"));
  }
  const hasGitName = await git(root, "config", "user.email").then(() => true).catch(() => false);
  if (!hasGitName) {
    await git(root, "config", "user.name", "social-forge").catch(() => {});
    await git(root, "config", "user.email", "social-forge@webcules.local").catch(() => {});
  }
  await commitProject(slug, `project: initialize ${slug} (social-forge)`);
}

// ---------- posts ----------

export function listPosts(slug: string): Post[] {
  const postsDir = projPath(slug, "posts");
  if (!fs.existsSync(postsDir)) return [];
  const out: Post[] = [];
  for (const id of fs.readdirSync(postsDir)) {
    const p = path.join(postsDir, id, "post.json");
    if (fs.existsSync(p)) {
      try {
        out.push(readJson(p) as Post);
      } catch {}
    }
  }
  return out.sort((a, b) => ((a.scheduledFor ?? a.createdAt) < (b.scheduledFor ?? b.createdAt) ? -1 : 1));
}

export function getPost(slug: string, id: string): Post | null {
  const p = projPath(slug, "posts", id, "post.json");
  return fs.existsSync(p) ? readJsonSafe<Post | null>(p, null) : null;
}

export function savePost(slug: string, post: Post): Post {
  post.updatedAt = nowIso();
  writeJson(projPath(slug, "posts", post.id, "post.json"), post);
  return post;
}

export function nextPostId(slug: string, platform: string): string {
  const posts = listPosts(slug).filter((p) => p.platform === platform);
  let n = posts.length + 1;
  const taken = new Set(posts.map((p) => p.id));
  while (taken.has(`${platform}-${n}`)) n++;
  return `${platform}-${n}`;
}

export function setPostStatus(slug: string, id: string, status: PostStatus, note?: string): Post {
  const post = getPost(slug, id);
  if (!post) throw new Error(`no post ${id}`);
  post.status = status;
  if (note !== undefined) post.review = { note, at: nowIso() };
  return savePost(slug, post);
}

// ---------- file tree (asset browser) ----------

export type TreeNode = { name: string; path: string; type: "dir" | "file"; size?: number; mtime?: string; children?: TreeNode[] };

export function fileTree(slug: string, rel = "", depth = 4): TreeNode[] {
  const root = projPath(slug);
  const dir = rel ? path.join(root, rel) : root;
  if (!dir.startsWith(root)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const nodes: TreeNode[] = [];
  for (const e of entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))) {
    if (e.name.startsWith(".git")) continue;
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      nodes.push({ name: e.name, path: childRel, type: "dir", children: depth > 0 ? fileTree(slug, childRel, depth - 1) : undefined });
    } else {
      const st = fs.statSync(path.join(dir, e.name));
      nodes.push({ name: e.name, path: childRel, type: "file", size: st.size, mtime: st.mtime.toISOString() });
    }
  }
  return nodes;
}
