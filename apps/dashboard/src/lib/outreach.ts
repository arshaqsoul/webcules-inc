import type { Finding } from "@/lib/forge";
import { installmentFor } from "@/lib/pricing";

export type OutreachContext = {
  business: string;
  contactName?: string | null;
  industry?: string | null;
  siteUrl?: string | null;
  previewUrl?: string | null;
  grade?: { uiux: string; conversion: string; ai: string } | null;
  findings?: Finding[] | null;
  quote: { oneTime: number; maintenanceMonthly: number; marketLow: number; marketHigh: number };
};

const n = (x?: string | null) => (x && x.trim() ? x.trim() : "");
const owner = (c: OutreachContext) => n(c.contactName) || "there";

/**
 * The FIRST cold email — deliberately zero links and zero images:
 *.workers.dev links are spam-blocked (Microsoft blocks the whole suffix), inline
 * images add HTML weight a fresh domain can't afford. The preview link + the
 * before/after image go out AFTER they reply (draftReply) or via WhatsApp.
 */
export function draftEmail(c: OutreachContext): { subject: string; body: string } {
  const top = (c.findings ?? []).filter((f) => f.severity !== "minor").slice(0, 3);
  const findingsBlock = top.length
    ? top
        .map((f) => `• ${f.title.length > 84 ? f.title.slice(0, 81) + "..." : f.title}`)
        .join("\n")
    : "• hard to read on phones • invisible to AI search";

  const plan = installmentFor(c.quote.oneTime);
  const subject = `I rebuilt ${c.business}'s website — have a look, ${owner(c)}`;

  const body = `Hi ${owner(c)},

I'm Arshaq — a solo developer here in Saskatoon. ${c.business}'s website undersells a great ${n(c.industry) || "local"} business, so I rebuilt it. No catch.

Three things stood out when I audited the current site:

${findingsBlock}

Also: customers now ask ChatGPT and Google's AI for "best ${n(c.industry) || "business"} in Saskatoon" — your current site is ${/^[AB]/.test(c.grade?.ai ?? "") ? "only partially" : "hardly"} readable by those. The rebuild fixes that.

The price, in the open: $${c.quote.oneTime} CAD (or $${plan.monthly}/month × ${plan.months}) — Saskatoon studios quote $${c.quote.marketLow}–$${c.quote.marketHigh} for this. After that: $${c.quote.maintenanceMonthly}/month for hosting and edits, cancel anytime.

I have before/after screenshots of your homepage ready — want me to send them over? Reply "yes" and I'll email them, or a "1" on WhatsApp works too.

Arshaq
Webcules · Saskatoon

(If you'd rather I not email again, just say the word.)`;

  return { subject, body };
}

/** The REPLY payload — comparison image attached + live preview link. Safe in an engaged thread. */
export function draftReply(c: OutreachContext): { subject: string; body: string } {
  const top = (c.findings ?? []).filter((f) => f.severity !== "minor").slice(0, 3);
  const fixes = top.length
    ? top.map((f) => `• ${f.title} — fixed`).join("\n")
    : "• Mobile experience and AI-readiness — both fixed";
  const plan = installmentFor(c.quote.oneTime);

  const subject = `Re: I rebuilt ${c.business}'s website`;
  const body = `Here's the before/after of the ${c.business} homepage, ${owner(c)} — the attachment says it better than I can.

The live preview is fully clickable, try it on your phone:
${n(c.previewUrl) || "[preview URL — set it on the lead's Project tab]"}

The three biggest fixes from the audit are all in there:
${fixes}
(full one-page audit attached as well, if you want the details)

Happy to make it live on your domain this week — $${c.quote.oneTime} CAD (or $${plan.monthly} CAD/month × ${plan.months}); I handle the domain switch and everything technical. After that, $${c.quote.maintenanceMonthly}/month, cancel anytime.

Any tweaks you'd want? Colours, photos, wording — all adjustable before it goes live.

Arshaq · Webcules, Saskatoon`;

  return { subject, body };
}

export function draftWhatsApp(c: OutreachContext): string {
  const top = (c.findings ?? []).filter((f) => f.severity === "critical")[0];
  const hook = top ? top.title.toLowerCase() : "your website";
  const plan = installmentFor(c.quote.oneTime);
  return `Hi ${owner(c)}, it's Arshaq — a developer here in Saskatoon. I noticed ${hook} on ${c.business}'s site, so I rebuilt the whole thing to show what's possible (no catch): ${
    n(c.previewUrl) || "[preview link]"
  }

$${c.quote.oneTime} CAD to go live on your domain (or $${plan.monthly} CAD/month × ${plan.months} — studios charge $${c.quote.marketLow}–$${c.quote.marketHigh}). $${c.quote.maintenanceMonthly}/mo after that, cancel anytime. Let me know when free for a chat?`;
}

/**
 * Facebook DM — sent from the Webcules page, so a link survives, but a message to a
 * business page you've never talked to lands in Message Requests: the ask has to be
 * "open the preview", not "reply yes" (requests get forgotten once unread).
 */
export function draftFacebook(c: OutreachContext): string {
  const top = (c.findings ?? []).filter((f) => f.severity !== "minor")[0];
  const plan = installmentFor(c.quote.oneTime);
  return `Hi ${owner(c)}, Arshaq here — I run Webcules, a one-person web studio in Saskatoon. ${c.business}'s website undersells the business (${
    top ? top.title.toLowerCase() : "it's hard to use on phones"
  }), so I rebuilt the whole thing — no catch, just want you to see it: ${n(c.previewUrl) || "[preview link]"}

If you like what you see, it goes live on your own domain for $${c.quote.oneTime} CAD (or $${plan.monthly}/month × ${plan.months} — Saskatoon studios charge $${c.quote.marketLow}–$${c.quote.marketHigh} for the same thing), and I handle the domain switch and everything technical. Worth a look?`;
}

/**
 * Instagram DM — IG filters links in DMs between non-mutuals, so the first message
 * carries zero links: the ask is "want the before/after?", the link goes out on reply.
 */
export function draftInstagram(c: OutreachContext): string {
  const top = (c.findings ?? []).filter((f) => f.severity === "critical")[0];
  const hook = top ? top.title.toLowerCase() : "it's showing its age";
  const plan = installmentFor(c.quote.oneTime);
  return `Hey ${owner(c)} — Arshaq, web developer in Saskatoon. ${hook} on ${c.business}'s website, so I rebuilt it for free to show what it could be. I've got the before/after ready if you want a look.

If you like it, it's yours: $${c.quote.oneTime} CAD to go live on your domain, or $${plan.monthly}/month × ${plan.months}. No pressure either way — want me to send it over?`;
}

/**
 * TikTok DM — shortest of the lot (DMs from non-mutuals are throttled and links are
 * dead on arrival): one hook, one offer, ask before sending anything.
 */
export function draftTiktok(c: OutreachContext): string {
  const top = (c.findings ?? []).filter((f) => f.severity === "critical")[0];
  const hook = top ? top.title.toLowerCase() : "your site loads slow on phones";
  const plan = installmentFor(c.quote.oneTime);
  return `hi ${owner(c)} — arshaq, web dev in saskatoon. ${hook} on ${c.business}'s website, so i rebuilt the whole thing and recorded a before/after walkthrough. if you want it, it's yours: $${c.quote.oneTime} CAD (or $${plan.monthly}/mo × ${plan.months}), i handle everything technical. can i send it?`;
}

export function draftFollowup(c: OutreachContext, day: 3 | 7): string {
  if (day === 3) {
    const top = (c.findings ?? []).filter((f) => f.severity !== "minor")[0];
    return `Hi ${owner(c)} — one thing from the audit I sent: ${
      top ? `${top.title.toLowerCase()} (${top.cost.toLowerCase()})` : "the current site turns away mobile visitors"
    }. It's fixed in the rebuild — I have the before/after screenshot right here, say the word and I'll send it. — Arshaq`;
  }
  return `Hi ${owner(c)}, last note from me — I take preview sites down after two weeks to keep things tidy. If you'd like a 5-minute walkthrough of what changed (and what it'd take to go live), just reply here. Either way, the audit is yours to keep. — Arshaq, Webcules`;
}
