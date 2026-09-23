import fs from "node:fs";
import path from "node:path";
import { SOCIAL_ROOT, die, flagStr, log, readManifest, writeManifest, type Args } from "./util.ts";

/**
 * The user gate between analysis and build. The agent presents the analysis
 * (research/component-analysis.md — the identified components, the flagship spec, the
 * variants), the user confirms or gives feedback, and `social confirm` records that
 * approval in the manifest. Every downstream command (registry/publish/render/post)
 * refuses to run until this has happened.
 */
export async function cmdConfirm(args: Args) {
  const slug = flagStr(args, "project");
  if (!slug) die("usage: social confirm --project <slug> [--notes 'user feedback / adjustments']");
  const m = readManifest(slug);

  const analysisPath = path.join(SOCIAL_ROOT, slug, "research", "component-analysis.md");
  if (!fs.existsSync(analysisPath)) {
    die("no analysis to confirm — write research/component-analysis.md first (PLAYBOOK.md phase 2)");
  }
  const analysis = fs.readFileSync(analysisPath, "utf8");
  // the ingest skeleton carries the literal placeholder "## Flagship spec — <ComponentName>"
  if (/## Flagship spec — </.test(analysis)) {
    die("component-analysis.md is still the unfilled skeleton — complete the analysis before asking for confirmation");
  }
  if (!m.component.name || !m.component.file) {
    die(
      "manifest has no component picked yet — after the user confirms, set component.name and component.file (packages/ui/src/components/ui/<name>.tsx) in social.project.json",
    );
  }

  const feedback = flagStr(args, "notes");
  m.status = "confirmed";
  m.analysis = { confirmedAt: new Date().toISOString(), feedback: feedback ?? m.analysis?.feedback ?? "" };
  writeManifest(slug, m);

  log.ok(`analysis confirmed — ${m.slug} cleared for build`);
  console.log(`  component : ${m.component.name} → ${m.component.file}`);
  console.log(`  variants  : ${Object.keys(m.variants ?? {}).join(", ") || "(none set)"}`);
  if (feedback) console.log(`  feedback  : ${feedback}`);
  console.log(`  next      : build packages/ui/src/components/ui/${m.component.name}.tsx, then`);
  console.log(`              preview + docs + social publish --project ${slug} (lands in the component library)`);
}
