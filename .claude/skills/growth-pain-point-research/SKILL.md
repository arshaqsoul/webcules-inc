---
name: growth-pain-point-research
description: Procedure for finding and validating real photographer pain points from public sources and recording them in the growth ledger. Use when discovering new pain points or validating DISCOVERED records.
---

# Pain point research

## What counts

A pain point is a recurring frustration a working photographer has with a task, stated from their side.
Good: "clients forward my gallery link to people who should not see it."
Not good: "I want a cheaper camera", "Lightroom is slow", "I hate Mondays."

Snap's territory is the business side: booking, inquiries, contracts, invoices and payments, client galleries and delivery, selection and proofing, organizing and culling, branding, and managing several shoots at once.
Gear and editing-software complaints are out of scope unless they point at a workflow Snap could own.

## Where to look

| Source | How | Notes |
|---|---|---|
| Reddit | the founder's logged-in Chrome, **read-only**, on `old.reddit.com` (WebFetch and WebSearch cannot read Reddit) | note the thread date, prefer the last 12 months, max 25 threads per run |
| Instagram | the founder's logged-in Chrome, **read-only** | scroll Reels and carousels from photographers, read comments for complaints |
| YouTube | comments on photography business videos | |
| Review sites and forums | reviews of competing tools | one-star reviews are dense with pain |
| Facebook groups | only a group the founder explicitly opened for you | never search or scrape others |

Search phrases that surface pain: "how do you deliver", "clients keep asking", "is there a way to", "I waste hours", "switching from", "alternative to", "nightmare", "chasing payment", "gallery link", "selecting photos", "contracts".

## Reddit in the browser

1. Load the Chrome tools with ToolSearch, call `tabs_context_mcp`, and open your own tab.
2. Search a subreddit: `https://old.reddit.com/r/<sub>/search?q=<terms>&restrict_sr=on&sort=top&t=year`.
3. Open promising threads, read with `get_page_text`, and capture the permalink and date.
4. Read only: no votes, comments, joins, saves, messages or setting changes.
5. A login wall or CAPTCHA means stop and report, never work around it, never type a password.

## Procedure

1. Pick a theme from the orchestrator's brief or from the weekly analyst note.
2. Collect candidate threads and posts.
   For each, write a one-line paraphrase, the url, the source type and today's date.
3. Group candidates into distinct pain points.
   A pain point needs at least 3 items on at least 2 hosts.
4. Check `ledger.mjs list` for duplicates and add evidence to an existing record where one fits.
5. Create the record:

```
node growth/scripts/ledger.mjs new --title "..." --statement "..." --persona wedding --severity 4 --frequency 3 \
  --set evidence='[{"source":"reddit","url":"...","summary":"...","captured_at":"2026-10-03"}, ...]'
```

6. Validate: `node growth/scripts/ledger.mjs transition PP-### VALIDATED --by researcher`.

## Rating

| Severity | Meaning |
|---|---|
| 1 | mild annoyance |
| 2 | wastes minutes |
| 3 | wastes hours per month |
| 4 | costs money or clients |
| 5 | threatens the business or reputation |

| Frequency | Meaning |
|---|---|
| 1 | one niche |
| 3 | many photographers, regularly |
| 5 | nearly every working photographer |

## Rules

- Paraphrase, do not paste long quotes, and never name private individuals in a committed file.
- Do not invent a source or a number.
  If you could not verify something, leave it out.
- Instagram is read-only.
  No likes, follows, saves, comments or DMs.
- Prefer the persona that matches Snap's paying users: solo and small-studio wedding, event and portrait photographers.
