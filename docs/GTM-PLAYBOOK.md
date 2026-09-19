# Webcules go-to-market playbook

Saskatoon first. Solo operator, AI-powered pipeline, evidence-led outreach. This is the manual; `/forge-redesign` and `/forge-outreach` execute it, the dashboard tracks it.

## Positioning (one sentence)

> Webcules gets Saskatoon businesses a $10k-quality website for a fraction of agency cost — and makes them readable by the AI assistants their future customers are already asking.

The differentiator is **proof over promises**: every pitch ships with (1) a finished redesign on a live preview link, (2) an independent expert audit of their current site, (3) an honest price. Agencies sell mockups and discovery calls; we hand over the product.

## Who to target (week 1 list: 10 businesses)

Great prospect = real revenue + weak site + owner-reachable:

1. **Pick categories where the site drives bookings**: restaurants/cafés, dentists & physio, salons/barbers, roofing/renos, auto shops, gyms/studios, law/accounting, photographers, trades (electricians, HVAC), real-estate agents.
2. **Find them**: Google Maps → search "<category> saskatoon" → open the top 20 listings → visit each website from the listing. Weak-site signals: not mobile-friendly, ©2019–2023 footer, Wix/GoDaddy/Weebly template smell, no hours/prices, menu as PDF, missing meta titles ("Home"), Facebook page listed as the website.
3. **Prioritize**: Google review count ≥ 30 (healthy business, slow site = losing bookings they already earned) and a visible phone number (owner picks up).
4. **Avoid (for now)**: chains/franchises (decision is corporate), brand-new businesses (no revenue pain yet), perfect sites (nothing to show), medical with strict compliance needs.

Log every prospect in the dashboard as a **lead** — even the ones you don't redesign this week. The list compounds.

## The engine (per prospect)

```
/forge-redesign <url>      → before capture + expert audit + rebuild + quote + gtm.json
   (review gate: you approve before anything deploys)
   → after approval: forge deploy → preview URL on *.workers.dev
/forge-outreach <project>  → email.md (no links) + reply.md (image+link payload)
                            + before-after.jpg + whatsapp.md + followups.md
dashboard /forge → Scan → import the lead + project
   → send the no-link email + WhatsApp (carries the link) → log both
   → they reply → send the reply pack (before-after.jpg + preview link)
   → day 3 follow-up (still no links) · day 7 last nudge → win / park / lost
```

Capacity reality: one redesign ≈ 3–6 h of supervised pipeline (research + ComfyUI + build). Do **2–3 per week**, don't batch 10 mediocre ones. One flawless preview converts better than five rushed ones.

## The outreach rules

- **Email first, WhatsApp same day if a mobile number is public.** WhatsApp reply rates are higher; email carries the full story.
- Send from **arshaq@webcules.com** (create it in Zoho — a person, not a brand); keep **business@webcules.com** for invoices and Stripe receipts. Never mix: one address does all outreach, forever.
- **Deliverability checklist (once, then forget):** SPF + DKIM + DMARC set in Zoho admin for webcules.com → verify at mail-tester.com (aim 9+/10) and send yourself a test at a personal Gmail to confirm it lands in the inbox. Warm a fresh mailbox 1–2 weeks of normal email before cold sends. Max 5–10 cold emails/day, plain personal formatting (no HTML template, no attachments, 1–2 links max). Replies are the reputation signal — personalized beats everything.

## Deliverability — the anti-spam law (learned the hard way)

The channel decides what a message can carry. Treat this as law, not advice:

| Channel | Can carry | Must never carry |
|---|---|---|
| **Cold email (first touch)** | plain text, story, findings, price, permission-ask CTA | **any link** (workers.dev is hard-blocked by Microsoft; unknown domains discounted by Gmail), **any image** (HTML weight a fresh domain can't afford), **any attachment** (incl. the audit PDF) |
| **Email reply (they engaged)** | before/after image attached, live preview link, audit PDF, checkout link | — (engaged threads are trusted; this is where the payload goes) |
| **WhatsApp (first touch ok)** | preview link, before/after image, audit PDF | — (WhatsApp doesn't spam-filter links) |

The flow that falls out of this:

1. **Cold email** = zero links. Ends with: *"I have before/after screenshots of your homepage ready — want me to send them over? Reply 'yes'."* The CTA earns the reply; the reply IS the deliverability win (engagement is the strongest reputation signal).
2. **They reply** → send the **reply pack**: `before-after.jpg` attached + the live preview link + fixes + price recap. Generate the image with `apps/site-forge/scripts/before_after.py` (or the dashboard's Reply-pack tab).
3. **WhatsApp same day** (if a number exists): the hook text + the live link immediately — WhatsApp is the link-carrying channel on day one.

Other tripwires already handled — keep them handled:

- **Bounces:** a bounced cold email is a reputation hit. The moment one bounces, open the dashboard → Outreach → mark it **Bounced** → stop emailing that address; switch to WhatsApp or find another contact. Never resend to a bounced address.
- **mailto length:** the cold email stays under ~1,500 characters so the one-click "Email pitch" button doesn't get truncated by Gmail-as-default-handler.
- **One-click Zoho compose:** the "Email pitch" button opens your default `mailto:` handler with everything prefilled — set Zoho Mail as that handler once and every pitch opens in Zoho compose. With the Zoho desktop app: Windows Settings → Apps → Default apps → choose defaults by protocol → **MAILTO → Zoho Mail** (or set "default composer" inside the app's settings). Don't rely on the undocumented `mail.zoho.com/zm/#compose` web link — Zoho doesn't guarantee it; the mailto route is the officially supported one.
- **Warm-up discipline:** create arshaq@webcules.com at least 1–2 weeks before the first cold send (normal email traffic both directions). Don't cold-send from a mailbox created yesterday.
- **Volume:** ≤10 cold/day, and our real pace is 2–3/week — stay there.
- **No trackers, no URL shorteners, no HTML templates** — the drafts are already plain text; don't "upgrade" them.
- **Send window:** Tue–Thu, 8–11 a.m. Saskatoon time is the safe default.
- **Preview hosting (the permanent fix):** links in emails will always be second-class until previews live on a real domain. When convenient, add `webcules.com` to Cloudflare and attach a custom domain like `preview.webcules.com` (routes to the same workers) — then every preview link reads `mexroofing.preview.webcules.com` instead of `*.workers.dev`, and even links become inbox-safe. 30-minute job in the Cloudflare dashboard.
- **Stripe checkout redirect:** after a client pays, the "success" redirect currently points at localhost (dead page for them — payment still completes). Point it at a public thank-you page on webcules.com once one exists.
- The email: their specific problem (from the audit) → your story in 2 sentences → 3 expert findings → the preview link → price in the open vs market range → one-word CTA ("Reply 'go'").
- **Follow-ups close the deals**: day 3 (one finding's cost), day 7 (honest last nudge — previews come down after two weeks). Stop there. Two touches that add value, never spam.
- **The audit PDF is the proof**: `/forge-outreach` produces a 2-page client-facing scorecard (`audit-report.pdf`) — grades, findings with fixes, price vs market. Attach it to WhatsApp and replies freely; on the first cold email prefer links only (attachments nudge spam filters) — attach the PDF once they've replied or on WhatsApp.
- When they reply ANYTHING positively: offer a 10-minute call or a walkthrough of the preview. Speed wins — reply same hour.

## The close & launch checklist (after "go")

1. Payment: Stripe checkout link (dashboard → lead → Payments) or e-Transfer; record it either way. Upfront in full, or installments (max 6 months, same total — e.g. $799 → 6 × $133).
2. Domain: get registrar login (or guide them to point NS/A/CNAME records — they stay the owner, always). Checklist: unlock, update records, TTL 300, verify propagation, keep email/MX untouched.
3. Switch: `forge deploy` to production, attach custom domain in Cloudflare, set redirects from old paths, re-run the AI-readiness checks on the live domain.
4. Say thank you: short email with before/after screenshots (they will forward it — that's referral fuel) + invoice receipt.
5. Ask for the review/referral after 2 weeks, once they've felt the difference.
6. Start the $10/mo maintenance subscription (Stripe subscription or tracked e-Transfer).

## Objection handling (the honest answers)

| They say | You say |
|---|---|
| "Why so cheap? What's the catch?" | "No agency overhead — I'm one developer in Saskatoon with an AI-powered pipeline I built myself. The site you saw is the quality; the price is what it costs me to produce it." |
| "I already have a website." | "You do — and it's costing you every mobile visitor and every AI search. The preview link shows what customers see instead. Takes nothing to look." |
| "My nephew/friend can do it." | "Great — keep them for content updates. This is the difference between a weekend site and one engineered to convert and to be found by AI assistants. It's already built; you can compare side by side." |
| "$799 is still a lot." | "Then split it — $133 a month for six months, same total. One missed booking costs more than a payment, and the studio alternative starts at $2,500 for the same 5 pages." |
| "Let me think about it." | "Of course. The preview stays live for two weeks — want me to walk you through the three biggest fixes in 5 minutes this week?" |
| "Who owns it?" | "You do. Domain in your name, code in a repo you control, no lock-in. If you leave, everything goes with you." |

## Numbers that make this a business

- 10 prospects/week logged → 2–3 redesigned → ~30–40% reply on personalized+proof outreach → 2–4 closed/month.
- 3 closes/month at $799 avg (upfront or 6 × $133) + growing $10/mo base: **~$2,400/mo one-time + MRR compounding $30/mo every month you keep going.** Twelve months in, maintenance alone ≈ $360+/mo for a few hours of edits.
- The moment maintenance MRR feels like a salary, raise one-time prices $100–200 per tier — demand is proving the anchor.

## Later (do not do yet)

More cities (Regina, Prince Albert — same playbook, swap the local proof), productized "AI-readiness audit" as a free lead magnet, a public Webcules portfolio page of before/afters, referral fee for local accountants/consultants. First: ten Saskatoon prospects, three redesigns, one paying client.
