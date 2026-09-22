import { parseArgs, log } from "./social/util.ts";
import { cmdIngest } from "./social/ingest.ts";
import { cmdSync } from "./social/sync.ts";
import { cmdRegistry } from "./social/registry.ts";
import { cmdRender } from "./social/record.ts";
import { cmdPost } from "./social/posts.ts";
import { cmdPublish } from "./social/publish.ts";

const HELP = `
${"social-forge"} — motion-component forge (reference video → reusable component → shadcn registry → FB/IG post pack)

${"usage:"} social <command> [options]

${"pipeline"}
  ingest     <video|webp|gif> --name <slug>            start a project: copy reference, extract frames, scaffold analysis
  sync       --project <slug>                          copy the project's component + demo into the demo gallery (apps/social-forge/src/demos)
  registry   --project <slug>                          emit shadcn registry item + collection + manual-download zip
  render     --project <slug> [--url u] [--seconds n]  record the real component: wide video, vertical reel, variant stills (playwright + ffmpeg)
  post       --project <slug>                          write the FB/IG post pack (captions, hooks, hashtags) from the manifest
  publish    --project <slug>                          publish into the Webcules landing library (entry + preview + /r registry JSON)

${"utility"}
  help       this help

${"notes"}
  Analysis (research/component-analysis.md) and the component itself (packages/ui/src/components/ui/<name>.tsx)
  are agent work — the CLI is the toolkit, judgment is yours. Read PLAYBOOK.md before building.
  Nothing ever posts automatically; the post pack is assembled for manual posting.

${"env"}  COMFY_URL (default http://127.0.0.1:8188, optional — textures/posters) · SOCIAL_FORGE_URL (running demo server for render)

${"examples"}
  social ingest ~/Downloads/neural-hero.mp4 --name neural-pathways
  social sync --project neural-pathways
  social registry --project neural-pathways
  social render --project neural-pathways --seconds 8
  social post --project neural-pathways
`;

const commands: Record<string, (a: ReturnType<typeof parseArgs>) => any> = {
  help: () => console.log(HELP),
  ingest: cmdIngest,
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
