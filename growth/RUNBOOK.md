# Runbook - make a Snap reel from scratch

This is the shortest correct path from "nothing" to a postable reel.
It was proven end to end on PP-003 (see `growth/examples/PP-003/WALKTHROUGH.md`).
Read `growth/AGENTS.md` first for the rules, then `growth/LESSONS.md` for the mistakes already made.

## 0. Orient yourself (2 minutes)

```bash
node growth/scripts/ledger.mjs status                      # the pipeline at a glance
node growth/scripts/reel.mjs status PP-###                 # one record: its state, next role, next step
node growth/scripts/ledger.mjs next --role <your role>     # what you may pick up
node --test growth/scripts/*.test.mjs growth/scripts/qc/qc.test.mjs   # everything should be green
```

You need `growth/.env.local` (copy `growth/.env.example`).
It holds the staging login and `GROWTH_SAFE_EMAILS`, the only addresses a take may send real email to.
Never print it, never commit it, never type the password into a browser tool.

## 1. The two kinds of record

| Kind | What it is | Start |
|---|---|---|
| `pain_point` | a real photographer problem with public evidence | researcher creates it with `ledger.mjs new` and 3 sources on 2 hosts |
| `launch` | a brand or product reel with no pain point | `ledger.mjs new --kind launch ...` and `--set launch.brief=<path to a brief>` |

Both follow the same states from TIER_MAPPED onward.
A launch record's VALIDATED guard wants an existing brief file instead of evidence.

## 2. The reel path (solved or launch records)

Each step names its role.
Roles are subagents in `.claude/agents/`, but any agent may follow the same commands.

### Mapper - is it real, and on which tier?

Skill: `.claude/skills/growth-tier-mapping/SKILL.md`.
Walk the flow in the staging app (read-only) and cite code files.
Only a `solved` verdict goes on to a reel.
Record it with `ledger.mjs transition PP-### TIER_MAPPED --by mapper --set tier_mapping='{...}'`.

### Designer - the storyboard

```bash
node growth/scripts/reel.mjs new PP-###      # scaffolds storyboard.md, meta.json, take.mjs
```

Fill `growth/storyboards/PP-###.md` and `PP-###.meta.json`.
Rules that the checker and QC enforce:

- Hook of 6 words or fewer, each step caption of 6 words or fewer.
- Every price, limit or tier word on screen (`Free`, `Lite`, `Studio`, `Pro`, `$`, `GB`, `%`) appears in `meta.claims` with a real source file.
- One idea, 4 to 6 steps, aim for 20 to 30 seconds (QC hard limits are 8 and 45 seconds, `DEMO-STANDARD.md` has the detail).
- Never claim what the reel does not show, and never claim a security guarantee the code does not give.
- No em dashes.

Then `ledger.mjs transition PP-### DEMO_SCRIPTED --by designer --set demo.storyboard=growth/storyboards/PP-###.md`.

### Recorder - the take script

Copy the pattern from `growth/templates/take.mjs`, and read `growth/storyboards/PP-003.take.mjs` as the worked example.
Fill in `fixture`, `run`, and `teardown`.

```bash
node growth/scripts/reel.mjs check PP-###    # offline lint, run it after every change
node growth/scripts/reel.mjs make PP-###     # record, edit, QC (the only step that touches staging)
```

`make` stops at the first failure and tells you where.
On a recorder failure it saves `growth/recordings/PP-###/failure.png`: look at it first.

### Editor - look before you report

`make` already ran the editor and QC.
Extract frames and view them before you claim success:

```bash
OUT=<your scratchpad directory>          # temporary files belong in the session scratchpad, not /tmp
cd growth/out/PP-###
for t in 1 5 10 15 20; do ffmpeg -y -loglevel error -ss $t -i reel.mp4 -frames:v 1 -vf scale=360:-1 $OUT/f_$t.png; done
ffmpeg -y -loglevel error $(for t in 1 5 10 15 20; do echo -i $OUT/f_$t.png; done) -filter_complex hstack=inputs=5 $OUT/contact.png
```

Then read `$OUT/contact.png`.
Pick timestamps that fall inside each step (see `edl.json` for where zooms start).
Check: highlights sit on the right element, text is not clipped, the payoff is zoomed and readable, nothing private is visible.
QC passing does not replace looking.

Record the stages:

```bash
node growth/scripts/ledger.mjs transition PP-### RECORDED --by recorder --set demo.raw=growth/recordings/PP-###/raw.mp4 --set demo.events=growth/recordings/PP-###/events.json
node growth/scripts/ledger.mjs transition PP-### ENHANCED --by editor --set demo.edited=growth/out/PP-###/reel.mp4
node growth/scripts/ledger.mjs transition PP-### QC_PASSED --by editor --set demo.qc=growth/out/PP-###/qc.json
```

### Packager - the post

Skill: `.claude/skills/growth-reel-packaging/SKILL.md`, template `growth/templates/reel-package.md`.
Copy the reel, cover and qc.json into `growth/packages/PP-###/`, fill `package.md`, re-open every cited file to confirm each claim, then `transition PACKAGED --by packager --set demo.package=growth/packages/PP-###/package.md`.

### The founder

Posts the reel, then runs `ledger.mjs transition PP-### HUMAN_POSTED --by human --set post.url=<url> --set post.posted_by=human`.
Agents never post, comment, follow or message.

### Optional - the music version

After a reel passes QC, make a second version with a trailer-style soundtrack synced to the beats:

```bash
node growth/scripts/reel.mjs music PP-###
```

It needs ACE-Step 1.5 installed on the ComfyUI server in `GROWTH_COMFY_URL`.
If it is not, the command stops with the exact files to install and writes nothing.
`--engine standin` runs the whole pipeline with a synthesised stand-in bed, which is for testing only and which QC will not pass for posting.
Details and checks: `growth/DEMO-STANDARD.md` (Music version), skill `growth-music`.

### Keeping every PC in sync

Reels, covers and generated music are gitignored, so they travel through a private R2 bucket (`GROWTH_R2_BUCKET`, default `webcules-growth`):

```bash
node growth/scripts/sync.mjs status      # what differs between this PC and the bucket
node growth/scripts/sync.mjs push        # after you make or change a reel
node growth/scripts/sync.mjs pull        # on another PC, before you work
```

It only moves finished media (reels, music versions, covers, QC and edit files, generated beds), verifies every download by checksum, and never moves mailbox screenshots (`growth/assets/PP-###/`), raw footage, secrets or the ledger.
Stand-in music versions are never synced.
Needs `wrangler login` on the PC (it uses the wrangler in `apps/snap`).
The ledger is NOT synced: it lives in each checkout, so give every PC its own range of PP numbers or use `ledger.mjs snapshot` and the committed snapshots.

## 3. Pre-flight checklist before `make`

- [ ] `reel.mjs check PP-###` prints OK.
- [ ] The take changes only data it restores in `teardown()`.
- [ ] If anything the take clicks sends email: `export const sendsEmail = true`, and the recipient is in `GROWTH_SAFE_EMAILS`.
- [ ] No other agent holds the staging lock (`node growth/scripts/lock.mjs status staging`).
- [ ] You looked at the starting screen yourself (a plain Playwright screenshot is enough, it sends nothing).

## 4. When something fails

| Symptom | Look at |
|---|---|
| recorder says `FIXTURE STOP` | the message names what state staging is in, fix the data through the app |
| `growth/recordings/PP-###/failure.png` exists | open it, the screen at the moment of failure |
| QC fails on frozen frames | add real motion (a zoom, a push-in, a shorter dwell), never loosen the threshold |
| QC fails on claims | add the claim with a real source file, or remove the word from the reel |
| the highlight is on the wrong element | the page moved after it was measured: wait for it to settle, use `p.focus(el, { tight: true })` |
| anything else | `growth/LESSONS.md` |

## 4b. Stop conditions (do not work around these)

- The Chrome extension refuses a site (Reddit): stop and report.
- Staging email delivery fails: stop, the banner will say so.
- A fixture finds an unexpected address, a revoked or expired link, or data you did not expect: stop.
- A hook blocks a command: the rule is real, say so in your handoff.

Use `ledger.mjs block PP-### --by <you> --reason "..."` and write a handoff.

## 5. Handoff

End every task with the block from `growth/AGENTS.md`.
List the artifacts you produced, the state you left the record in, and anything the next role must know.
