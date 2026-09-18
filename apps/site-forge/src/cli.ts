import { parseArgs } from "./util.ts";
import { cmdDoctor } from "./doctor.ts";
import { cmdResearch } from "./research.ts";
import { cmdNew } from "./scaffold.ts";
import { cmdEdit, cmdGenerate, cmdModels, cmdWorkflows } from "./assets.ts";
import { cmdPreview, cmdBuild, cmdDeploy } from "./preview.ts";
import { cmdPublish } from "./publish.ts";

const HELP = `
${"site-forge"} — $10k-website generator (research → ComfyUI assets → Astro site → Cloudflare)

${"usage:"} forge <command> [options]

${"pipeline"}
  new          <name> [--title --desc --url --dir]   scaffold a new site project in webcules/<name>
  research     "<style query>" [--project p] [--count n] [--url extra]   fetch UI references + design-brief skeleton
  generate     --project p (--workflow w --set k=v | --manifest)        generate assets via ComfyUI → public/assets/
  edit         --project p --image img --prompt "..." [--out file]      instruction-based image edit (Qwen-Image-Edit)
  preview      --project p [--port 4321]                                run the dev server locally
  build        --project p                                              production build (dist/)
  publish      --project p [--repo name] [--public] [--message m]       git commit + private GitHub repo + push
  deploy       --project p                                              build + deploy to Cloudflare Workers

${"utility"}
  doctor       environment check (ComfyUI, models, gh, wrangler)
  models       list models ComfyUI currently offers
  workflows    list reusable workflows + defaults
  help         this help

${"env"}  COMFY_URL (default http://127.0.0.1:8188) · GITHUB_TOKEN (private repo creation)

${"examples"}
  forge doctor
  forge new aurora --title "Aurora Analytics" --desc "Fintech analytics, dark luxe"
  forge research "fintech landing dark luxury motion" --project aurora
  forge generate --project aurora --workflow z-image-turbo --set prompt="molten glass 3d abstract, lime accent" --out hero.png
  forge generate --project aurora --manifest            # runs every job in forge.assets.json
  forge preview --project aurora
`;

const commands: Record<string, (a: ReturnType<typeof parseArgs>) => any> = {
  help: () => console.log(HELP),
  new: cmdNew,
  research: cmdResearch,
  generate: cmdGenerate,
  edit: cmdEdit,
  preview: cmdPreview,
  build: cmdBuild,
  publish: cmdPublish,
  deploy: cmdDeploy,
  doctor: cmdDoctor,
  models: cmdModels,
  workflows: cmdWorkflows,
};

const args = parseArgs(process.argv.slice(2));
const fn = commands[args.cmd];
if (!fn) {
  console.log(`unknown command: ${args.cmd}\n`);
  console.log(HELP);
  process.exit(1);
}
await fn(args);
