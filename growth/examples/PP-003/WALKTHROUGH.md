# Worked example - PP-003, "client forwarded your gallery link"

This is the reel that proved the system.
Use it as the template for your own.
The files are committed, the media is not (see "Where the files are").

Result: a 27.7 second, 1080x1920, silent reel that passed all 14 QC checks, packaged for posting.

## The record, stage by stage

| Stage | Role | What happened | Artifact |
|---|---|---|---|
| DISCOVERED to VALIDATED | researcher | 3 pain points found about sharing and delivering galleries, each with 3 or more sources on 2 or more hosts | ledger records PP-001, PP-002, PP-003 |
| TIER_MAPPED | mapper | PP-003 judged **solved on Free**: every gallery link needs an emailed code sent only to the client, expiry and "New link" are ungated | `tier_mapping` on the record |
| DEMO_SCRIPTED | designer | 5 steps, hook "Client forwarded your gallery link?", honest framing, no Revoke on screen | `growth/storyboards/PP-003.md`, `.meta.json` |
| RECORDED | recorder (finished by the orchestrator) | take script, run against staging | `growth/storyboards/PP-003.take.mjs` |
| ENHANCED, QC_PASSED | editor | zooms, highlights, ripples, captions, two inbox scenes, end card | `growth/out/PP-003/` |
| PACKAGED | packager | caption, hashtags, UTM link, timing, claims check | `growth/packages/PP-003/package.md` |

## The decisions that made it good

1. **Honest framing over a stronger claim.**
   The tempting hook was "forwarded links cannot be opened".
   The code does not give that guarantee (a verified browser stays valid, a client can forward the code or files), so the reel says what is true: set an expiry, replace the link, the new one goes only to your client.
2. **No Revoke on screen.**
   The designer noticed staging cannot un-revoke a link, so a revoke take could not be repeated.
   "New link" restores itself.
3. **The take is repeatable.**
   `fixture()` resets the expiry and checks the row is live, `teardown()` restores it even if the take fails.
4. **It acts on one row only.**
   `rowOf(page)` scopes every locator to the single link row for the approved address, because the page has several similar rows.
5. **Email safety.**
   The take sets `sendsEmail = true` and `mask.allowEmails`, so the recorder refuses unless that address is in `GROWTH_SAFE_EMAILS`.
   Everyone else's address is blurred.
6. **It refuses a bad payoff.**
   If the banner says delivery failed, the take throws instead of recording it.
7. **The payoff is focused, not just held.**
   `p.focus(banner, { label: "payoff", tight: true })` zooms on the "Link emailed to the client" text.
8. **A real inbox scene.**
   Two cropped Gmail screenshots (only the Snap email, no sidebar, no other mail) are inserted after the recording through `meta.inserts`.

## The take, annotated

```js
export const format = "desktop";
const CLIENT = "<the approved, safe address>";
export const mask = { allowEmails: [CLIENT] };   // everything else on screen is blurred
export const sendsEmail = true;                  // New link emails the client, so the safe-recipient guard applies

export async function fixture(...) { /* load the page, verify exactly one live row for CLIENT, reset expiry, scroll the row to the middle */ }

export async function run({ p, page }) {
  p.step("s1", "Link already sent to a client");  // caption <= 6 words
  await p.move(chip); await p.hover(chip, 300);
  p.step("s2", "Set it to expire");
  await p.select(select, "7 days");               // native select: the editor draws the dropdown
  p.step("s3", "Or kill the old link");
  await p.click(newLink);
  p.step("s4", "Confirm, the old one dies");
  await p.click(dialog.getByRole("button", { name: "Confirm" }));
  p.step("s5", "Fresh link, old one dead");
  /* wait for the banner, throw if it says delivery failed, wait for the page to stop moving */
  await p.focus(banner, { label: "payoff", tight: true });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown(...) { /* reset the expiry, verify the row is ACTIVE */ }
```

The full file is `growth/storyboards/PP-003.take.mjs`.

## What to copy for a new reel

1. `node growth/scripts/reel.mjs new PP-###`
2. Pick a `solved` pain point, or create a `launch` record.
3. Write the storyboard, claims and meta (hook 6 words, every tier word cited).
4. Write the take from `growth/templates/take.mjs`: scope your locators, restore data, label the payoff.
5. `node growth/scripts/reel.mjs check PP-###` until it says OK.
6. `node growth/scripts/reel.mjs make PP-###`.
7. View frames, fix what looks wrong, rerun.
8. Advance the ledger, package, hand to the founder.

## Numbers from the real run

- 5 recorded steps plus 2 inbox scenes plus an end card.
- About 16 captured frames per second at 2x resolution, cursor composited at 30 fps.
- 3 clicks highlighted, 5 zoom windows, 1 speed ramp.
- 5.4 MB.

## Where the files are

| File | In git? |
|---|---|
| `growth/storyboards/PP-003.md`, `.meta.json`, `.take.mjs` | yes |
| `growth/packages/PP-003/package.md` | yes |
| `growth/recordings/PP-003/`, `growth/out/PP-003/`, reel and cover | no (gitignored media) |
| `growth/assets/PP-003/` (inbox crops of a real mailbox) | never |

To see the reel again, run `node growth/scripts/reel.mjs make PP-003` (this sends one email to the safe address).
