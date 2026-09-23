import { parseArgs, log } from "./social/util.ts";
import { cmdIngest } from "./social/ingest.ts";
import { cmdConfirm } from "./social/confirm.ts";
import { cmdSync } from "./social/sync.ts";
import { cmdRegistry } from "./social/registry.ts";
import { cmdRender } from "./social/record.ts";
import { cmdPost } from "./social/posts.ts";
import { cmdPublish } from "./social/publish.ts";

const HELP = `
${"social-forge"} — motion-component forge (reference video → analysis → user confirmation → component in the Webcules library → optional FB/IG post pack)

${"usage:"} social <command> [options]

${"pipeline"}
  ingest     <video|webp|gif> --name <slug>            start a project: copy reference, extract frames, scaffold analysis
  confirm    --project <slug> [--notes 'feedback']     USER GATE: record the user's approval of the analysis; nothing builds before this
  registry   --project <slug> [--url u]                emit shadcn registry item + collection + manual-download zip
  publish    --project <slug>                          install into the Webcules library (library.json + preview + docs page + /r/<name>.json)
  render     --project <slug> [--url u] [--path p]     optional: record the component — wide video, vertical reel, variant stills
  post       --project <slug>                          optional: write the FB/IG post pack (captions, hooks, hashtags) from the manifest

${"utility"}
  sync       --project <slug>                          regenerate the demo gallery route map (only for the optional render rig)
  help       this help

${"notes"}
  Analysis (research/component-analysis.md) and the component itself (packages/ui/src/components/ui/<name>.tsx)
  are agent work — the CLI is the toolkit, judgment is yours. The flow is: ingest → analyze → the user
  reviews the analysis and confirms (with feedback) → build the component directly in packages/ui →
  publish installs it in apps/landing's component library, listed like wildcode-field and neural-pathways.
  sync/render/post are the optional marketing extension. registry/publish/render/post refuse to run
  before the analysis is confirmed. Nothing ever posts automatically.

${"env"}  COMFY_URL (default http://127.0.0.1:8188, optional — textures/posters) · SOCIAL_FORGE_URL (running page server for render)

${"examples"}
  social ingest ~/Downloads/neural-hero.mp4 --name neural-pathways
  social confirm --project neural-pathways --notes "keep the lens, drop the particles"
  social publish --project neural-pathways
  social render --project neural-pathways --seconds 8 --url http://localhost:3000 --path /components/neural-pathways
  social post --project neural-pathways
`;

const commands: Record<string, (a: ReturnType<typeof parseArgs>) => any> = {
  help: () => console.log(HELP),
  ingest: cmdIngest,
  confirm: cmdConfirm,
  sync: cmdSync,
  registry: cmdRegistry,
  render: cmdRender,
  post: cmdPost,
  publish: cmdPublish,
};

const args = parseArgs(process.argv.slice(2));
const fn = commands[args.cmd];
if (!fn) {
  console.log(`unknown command: ${args.cmd}\n`);
  console.log(HELP);
  process.exit(1);
}
await fn(args);
