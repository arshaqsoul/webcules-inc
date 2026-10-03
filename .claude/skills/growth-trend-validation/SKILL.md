---
name: growth-trend-validation
description: The four-check procedure for validating that an Instagram trend is real, current and relevant before content is built on it, and for tracking trends over time. Use when evaluating or logging trends.
---

# Trend validation

Content built on a dead or fake trend wastes the effort.
Most audio and format trends last one to three weeks, so freshness matters as much as popularity.

## The four checks

All four must pass.

1. **Multiple creators.**
   At least 5 recent Reels from different accounts use it.
2. **Outlier performance.**
   Those Reels get well above each account's usual views, roughly 3x or more.
   Compare with the account's other Reels visible on its profile.
3. **Still rising.**
   Under 14 days old, and the usage count (shown on the audio page) is growing.
   Revisit a day later to see growth when unsure.
4. **Fit.**
   The format can be reskinned for photographers without changing what Snap really does.

## How to look

- Instagram in Chrome, read-only.
  Scroll Reels, open the audio page to read the usage count, open creator profiles to judge baselines.
- Prefer photographer, creator and small-business accounts first, then adjacent niches.
- Third-party trend roundups are only leads.
  Note them, then verify in the app.

## Log

For each candidate create `growth/trends/TR-###.md` from `growth/templates/trend.md`.

| Status | Meaning |
|---|---|
| candidate | spotted, not yet checked |
| validated | all four checks pass, valid-until set |
| expired | past its window or no longer rising |
| rejected | failed a check |

On every run, mark expired trends so nobody builds on them.

## Reskin quality

A good reskin keeps the trend's structure and swaps in a photographer's real situation.
Pair it with a pain point the product genuinely solves.
If you have to bend the product to fit the trend, reject the pairing.

## Rules

- Record observed numbers with the date.
  If you could not verify a number, say so and the check does not pass.
- Do not copy or closely describe another creator's content.
- Note sounds that may have commercial-use limits for business accounts, so the founder can decide.
- Instagram is read-only: no likes, follows, saves or comments.
