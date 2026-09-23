import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { SOCIAL_ROOT, REPO_ROOT, ensureDir, flagStr, log, readManifest, requireConfirmed, writeManifest, type Args } from "./util.ts";

function registryReadme(name: string, title: string, hostUrl: string): string {
  return `# ${title}

Part of the Webcules motion library. One file, zero runtime dependencies beyond React + Tailwind.

## Install (shadcn CLI)

\`\`\`bash
npx shadcn@latest add ${hostUrl}
\`\`\`

(Host the registry JSON anywhere static — GitHub Pages, R2, the backgrounds storefront — and point
the URL at it. See registry/${name}.json in the project repo.)

## Install (manual)

1. Copy \`ui/${name}.tsx\` into your project, e.g. \`components/ui/${name}.tsx\`.
2. Make sure the \`cn\` helper exists at \`@/lib/utils\` (shadcn default; it ships with every
   shadcn/ui project — \`npx shadcn@latest init\` creates it).
3. Tailwind v3.4+ or v4. No other dependencies.

## Use

\`\`\`tsx
import ${name.charAt(0).toUpperCase() + name.slice(1)} from "@/components/ui/${name}";

<div className="relative h-screen">
  <${name.charAt(0).toUpperCase() + name.slice(1)} className="absolute inset-0" />
  {/* your hero content on top */}
</div>
\`\`\`

The component is decorative by design — it renders a canvas, contains no content, and respects
\`prefers-reduced-motion\` (renders a single static frame instead of animating).

© Webcules Inc — ${new Date().getFullYear()}
`;
}

export async function cmdRegistry(args: Args) {
  const slug = flagStr(args, "project");
  if (!slug) log.err("usage: social registry --project <slug>") || process.exit(1);
  const m = readManifest(slug);
  requireConfirmed(m, "registry");
  if (!m.component.file || !m.component.name) {
    log.err(`manifest has no component yet — build it first (PLAYBOOK.md phase 3), then update social.project.json`);
    process.exit(1);
  }
  const compPath = path.join(REPO_ROOT, m.component.file);
  if (!fs.existsSync(compPath)) {
    log.err(`component file missing: ${m.component.file}`);
    process.exit(1);
  }

  // Registry copies rewrite the monorepo import to the shadcn convention.
  const raw = fs.readFileSync(compPath, "utf8");
  const content = raw.replaceAll(`@webcules/ui/lib/utils`, `@/lib/utils`);
  const name = m.component.name;
  const title = flagStr(args, "title") ?? name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const hostUrl = flagStr(args, "url") ?? m.component.registryUrl ?? `https://components.webcules.com/r/${name}.json`;

  const item = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name,
    title,
    description: m.component.description ?? `${title} — animated background component by Webcules.`,
    author: "Webcules Inc",
    type: "registry:component",
    dependencies: [],
    registryDependencies: [],
    categories: ["backgrounds", "motion"],
    files: [{ path: `ui/${name}.tsx`, content, type: "registry:component", target: `components/ui/${name}.tsx` }],
    docs: `Drop it in as an absolute-positioned layer behind hero content. Decorative + reduced-motion safe.`,
  };

  const collection = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "webcules",
    homepage: "https://webcules.com",
    items: [{ name, title, description: item.description, categories: item.categories, type: "registry:component" }],
  };

  const regDir = path.join(SOCIAL_ROOT, slug, "registry");
  const dlDir = path.join(SOCIAL_ROOT, slug, "downloads");
  ensureDir(regDir);
  ensureDir(dlDir);
  fs.writeFileSync(path.join(regDir, `${name}.json`), JSON.stringify(item, null, 2) + "\n");
  fs.writeFileSync(path.join(regDir, "registry.json"), JSON.stringify(collection, null, 2) + "\n");

  const docsDir = path.join(SOCIAL_ROOT, slug, "docs");
  const docReadme = path.join(docsDir, "README.md");
  const preview = path.join(docsDir, `${slug}-preview.webp`);
  const poster = path.join(docsDir, `${slug}-poster.webp`);
  if (fs.existsSync(preview)) item.docs += ` Live preview: ${hostUrl.replace(/\.json$/, "")}-preview.webp (animated WebP, also bundled in the zip).`;

  const zip = new JSZip();
  zip.file("ui/" + name + ".tsx", content);
  zip.file("README.md", fs.existsSync(docReadme) ? fs.readFileSync(docReadme, "utf8") : registryReadme(name, title, hostUrl));
  zip.file("registry.json", JSON.stringify(item, null, 2));
  if (fs.existsSync(preview)) zip.file(`${slug}-preview.webp`, fs.readFileSync(preview));
  if (fs.existsSync(poster)) zip.file(`${slug}-poster.webp`, fs.readFileSync(poster));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const zipPath = path.join(dlDir, `${name}.zip`);
  fs.writeFileSync(zipPath, buf);

  m.status = "packaged";
  m.component.registryUrl = hostUrl;
  writeManifest(slug, m);

  log.ok(`registry item : webcules/social/${slug}/registry/${name}.json`);
  log.ok(`collection    : webcules/social/${slug}/registry/registry.json`);
  log.ok(`manual zip    : webcules/social/${slug}/downloads/${name}.zip (${(buf.length / 1024).toFixed(0)} KB)`);
  console.log(`\nnote: the source component lives in ${path.relative(REPO_ROOT, compPath)} (canonical home)`);
}
