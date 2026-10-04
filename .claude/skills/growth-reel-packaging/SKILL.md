---
name: growth-reel-packaging
description: Procedure for assembling the final Instagram package for the founder - reel, cover, caption, hashtags, UTM link, timing, and a claims check - after QC passes. Use when the packager handles QC_PASSED records.
---

# Reel packaging

## Steps

1. Create `growth/packages/PP-###/` and copy `reel.mp4`, `cover.png` and `qc.json` from `growth/out/PP-###/`.
2. Copy `growth/templates/reel-package.md` to `growth/packages/PP-###/package.md` and fill every field.

## Caption

- Line one is the hook, under 125 characters, because Instagram truncates after that.
- Two to four short lines of value, plain and specific.
- One call to action, for example "Link in bio to try it free" (only if Free really covers it, otherwise name the tier).
- 5 to 8 hashtags, niche first (for example photographer business tags), broad last.
- Voice: direct, no hype words, no superlatives, no invented numbers, no em dashes.
  If `~/VOICE.md` does not exist, use the plain founder voice from the brief and say so in the notes.
- A `launch` record has no pain point: write an introduction instead (who built it, why, what it does, one call to action), and describe demo data as demo data.
- The call to action must match the plan the reel actually shows.
  If the reel is recorded on a higher-plan studio, do not say "try it free" about features the Free card does not list: say what the Free plan includes, and put the caveat in the pinned comment.
- Every claim matches a row in the claims table that cites a file in `apps/snap`.

## Link

`https://snap.webcules.com/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-###`
Use the landing or pricing page depending on the pain point.
The campaign value is the ledger id so signups trace back to a reel.

## Timing and order

When several reels are packaged, state the posting order in each package.
If your package changes the order, tell the orchestrator so the earlier package is updated (the orchestrator, not you, edits another record's package).
The first reel on an empty account should be the one that introduces the product.


Suggest a window for a Canada-based audience with the reason, and note that the founder can override.

## Audio

The reel carries synthesised sound effects and needs no added sound.
Say that in the package, and that the captions still carry the story for viewers with sound off.
If you suggest a trending sound on top, confirm in `growth/trends/` that it is validated and unexpired, and say it should be added inside Instagram at low volume.

## Engagement plan

List genuine comment ideas for relevant photographer accounts, drafted for the founder to send or discard.
Never send anything.

## Claims check

Re-open each cited file and confirm the claim, the tier and the number.
Anything unverifiable is removed from the caption.

## Finish

```
node growth/scripts/ledger.mjs transition PP-### PACKAGED --by packager --set demo.package=growth/packages/PP-###/package.md
```

Then tell the orchestrator the record is ready for the founder.
After the founder posts, the founder runs:

```
node growth/scripts/ledger.mjs transition PP-### HUMAN_POSTED --by human --set post.url=<instagram url> --set post.posted_by=human
```
