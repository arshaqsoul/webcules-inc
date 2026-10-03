# Lessons learned

Every item here cost real time on PP-003.
Each has a fix already in the tooling, but knowing why saves you from reinventing the mistake in a new form.

## Capture and recording

1. **A scrolled page recorded as blank white.**
   The screenshot `clip` is in document coordinates, not viewport coordinates.
   The recorder now follows the live scroll position, and refuses a recording whose frames are all identical.
2. **Native `<select>` popups are not captured.**
   The operating system draws them.
   Use `p.select(el, "option")`: it clicks for real, commits the value, and the editor draws the dropdown from the logged steps.
3. **Layout shifts after an action.**
   A banner inserts, a smooth scroll runs, a table row appears a second later.
   A box measured mid-motion puts the highlight on the wrong line.
   The performer waits for an element to stop moving before it measures, and `p.focus` waits longer.
   If a refresh arrives late (PP-003's Activity table), wait for it explicitly before focusing.
4. **Wide elements cannot be zoomed.**
   A banner that spans the page is too wide to zoom on.
   Use `p.focus(el, { tight: true })` to measure just the text.
5. **The recorder wipes `growth/recordings/PP-###/` on every run.**
   Keep inserted scene images in `growth/assets/PP-###/` (gitignored), never inside recordings.
6. **A failed take must still restore data.**
   `teardown()` now always runs.
   Design takes so they can be repeated: avoid destructive actions that cannot be undone (Revoke has no undo on staging).
7. **Playwright and browser versions drift.**
   `lib.mjs` finds the newest Chrome for Testing in the Playwright cache, so the pinned version does not matter.
8. **Failures hide behind cleanup.**
   Stop the capture loop before closing the browser, or its error masks the real one.
   The recorder now saves `failure.png` and reports the real error.

## Framing and zoom (learned on PP-004)

- **A step's zoom is anchored to the FIRST event in the step that has a box** (a click, hover, select, type or focus).
  `p.step()` placement therefore decides where the camera lands.
  To zoom on a project card, end the previous step with the click that opens the board and START the next step with the hover on the card.
- **A zoom holds until its step ends.**
  If a click in the same step loads a new page, the camera stays at the old position over the new page, so something unintended can land in frame (PP-004 briefly showed the Studio-only Heat button).
  Put the page-changing click at the end of one step and the first hover of the new page at the start of the next.
- **Targets wider than about 60 percent of the viewport are not zoomed.**
  Zoom a tight part of them instead: `p.focus(el.locator("xpath=.."), { tight: true })` on a total, a heading or a stat.
- **Dead load time is sped up automatically,** but only where neither the screen nor the cursor is moving, and never right after an action or on a `payoff`.
  QC counts a still stretch as frozen only if 0.8 s of it has neither a screen change nor visible cursor travel.
- **A held payoff always gets motion:** the focus outline pulses and the camera pushes in steadily.

## Email safety

9. **Never send email to an address you do not control.**
   Unknown recipients bounce, and enough bounces get the sending domain blocked.
   A take that makes staging send email must export `sendsEmail = true`, and its `mask.allowEmails` must all be in `GROWTH_SAFE_EMAILS`.
   Both `reel.mjs check` and `record.mjs` refuse otherwise, before anything runs.
10. **Staging says when delivery fails.**
    The banner reads "email delivery failed - copy it manually".
    Never record a payoff that says so: the take checks for it and stops.
11. **Blur everything else.**
    `mask.allowEmails` lists the only readable addresses on screen.
    Everything else is blurred before capture.
    Screenshots of a real inbox must be cropped to the single relevant email, kept in `growth/assets/`, never committed.

## Editing and QC

12. **QC is strict on stillness.**
    A zoom that eases to a stop reads as frozen over a mostly white screen.
    Fix it with real motion (steady linear push-ins, a camera drift a quarter-phase behind the zoom), never by loosening the threshold.
13. **A recording's tail can be dead time.**
    Measure the take's duration before teardown runs, or teardown time shows up as seconds of stillness at the end.
14. **Claims need sources.**
    Any price, limit or tier word on screen must be in `meta.claims` with a file that exists.
    The staging org may be on a higher plan than the one you claim, so keep paid-only UI out of the zoom.
15. **Do not overclaim.**
    "Free", "secure", "impossible to forward" are claims.
    State what the code does: the code goes only to the client's email, the old link stops working, a client can still share a code or files.

## Process

16. **Shell variables do not split commands in zsh.**
    `L="node growth/scripts/ledger.mjs"; $L ...` fails.
    Use a function: `L() { node growth/scripts/ledger.mjs "$@"; }`.
17. **Check the record's state before dispatching the next role.**
    A record that is blocked, or in the wrong state, makes the next agent stop.
18. **A block is a decision, not an obstacle.**
    If the Chrome extension refuses a site, or a fixture finds unexpected data, stop and report.
    Do not find another route to the same thing.
19. **Subagents cannot spawn subagents.**
    Only the orchestrator, running as the main session, dispatches.
20. **Never type credentials into a browser tool.**
    The recorder logs in programmatically from `growth/.env.local`.
21. **Staging data accumulates.**
    Each "New link" take leaves a REGENERATED row in the history.
    It is harmless, and it is blurred in the reel, but it grows.
22. **Look at real frames.**
    QC passing is necessary, not sufficient.
    Most real defects (wrong highlight, clipped text, a payoff too small to read) were found by viewing frames.

## Product facts worth remembering

- The staging demo org is "Amara & Oak Photography" and is on Studio, so Studio-only controls appear on the page even when a reel claims the Free plan.
- Sharing a gallery link and expiry controls are on every tier.
- The Activity panel is Lite and above, watermarks are Studio and above.
- The OTP gate means a forwarded link needs a code emailed only to the client, but a client can still forward the code or the downloaded files.
- The docs and the per-link expiry control disagree on the 60 day option (a known product bug).
