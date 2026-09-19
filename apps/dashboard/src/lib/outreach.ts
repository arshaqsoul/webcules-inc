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

function severityLabel(s: string) {
  return s === "critical" ? "Critical" : s === "major" ? "Important" : "Worth fixing";
}

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
        .map((f) => `• ${severityLabel(f.severity)}: ${f.title} — ${f.cost}`)
        .join("\n")
    : "• The site is hard to read on phones and invisible to AI search — both fixable.";

  const plan = installmentFor(c.quote.oneTime);
  const subject = `I rebuilt ${c.business}'s website — have a look, ${owner(c)}`;

  const body = `Hi ${owner(c)},

I'm Arshaq — a solo developer here in Saskatoon. I came across ${c.business}'s website and saw a great ${n(c.industry) || "local"} business hiding behind a site that undersells it. So I rebuilt it — the full site, no catch.

Before rebuilding, I ran a professional audit of the current one. Three things stood out:

${findingsBlock}

One more angle most owners haven't heard yet: customers now ask ChatGPT and Google's AI for "best ${n(c.industry) || "business"} in Saskatoon". Your current site is ${/^[AB]/.test(c.grade?.ai ?? "") ? "only partially" : "hardly"} readable by those systems — the rebuild fixes that.

The price, in the open: $${c.quote.oneTime} CAD (or $${plan.monthly} CAD/month × ${plan.months}) — Saskatoon studios typically quote $${c.quote.marketLow}–$${c.quote.marketHigh} for the same work. After that, $${c.quote.maintenanceMonthly}/month for hosting, updates and small edits, cancel anytime.

I have before/after screenshots of your homepage ready — want me to send them over? Just reply "yes", or a "1" on WhatsApp works too.

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

export function draftFollowup(c: OutreachContext, day: 3 | 7): string {
  if (day === 3) {
    const top = (c.findings ?? []).filter((f) => f.severity !== "minor")[0];
    return `Hi ${owner(c)} — one thing from the audit I sent: ${
      top ? `${top.title.toLowerCase()} (${top.cost.toLowerCase()})` : "the current site turns away mobile visitors"
    }. It's fixed in the rebuild — I have the before/after screenshot right here, say the word and I'll send it. — Arshaq`;
  }
  return `Hi ${owner(c)}, last note from me — I take preview sites down after two weeks to keep things tidy. If you'd like a 5-minute walkthrough of what changed (and what it'd take to go live), just reply here. Either way, the audit is yours to keep. — Arshaq, Webcules`;
}
