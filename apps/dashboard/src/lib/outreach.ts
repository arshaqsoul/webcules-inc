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

/** Mirrors the /forge-outreach command's email — generated here so the dashboard can draft without a round-trip. */
export function draftEmail(c: OutreachContext): { subject: string; body: string } {
  const top = (c.findings ?? []).filter((f) => f.severity !== "minor").slice(0, 3);
  const findingsBlock = top.length
    ? top
        .map((f) => `• ${severityLabel(f.severity)}: ${f.title} — ${f.cost}`)
        .join("\n")
    : "• The site is hard to read on phones and invisible to AI search — both fixable.";

  const subject = `I rebuilt ${c.business}'s website — have a look, ${owner(c)}`;

  const body = `Hi ${owner(c)},

I'm Arshaq — a solo developer here in Saskatoon. I came across ${c.business}'s website and saw a great ${n(c.industry) || "local"} business hiding behind a site that undersells it. So I rebuilt it. No catch, no obligation — here's the result:

${n(c.previewUrl) ? c.previewUrl : "[preview link — run forge deploy to get the URL]"}

Before rebuilding, I ran a professional audit of your current site. Three things stood out:

${findingsBlock}

There's one more angle most businesses haven't heard yet: customers now ask ChatGPT and Google's AI for "best ${n(c.industry) || "business"} in Saskatoon". Your current site is ${/^[AB]/.test(c.grade?.ai ?? "") ? "only partially" : "hardly"} readable by those systems — the rebuild fixes that, so you show up when AI recommends local businesses.

The price, in the open: $${c.quote.oneTime} CAD (or $${installmentFor(c.quote.oneTime).monthly} CAD/month × ${installmentFor(c.quote.oneTime).months}) to make it live on your domain — I handle the domain switch and everything technical; Saskatoon studios typically quote $${c.quote.marketLow}–$${c.quote.marketHigh} for this work. After that it's $${c.quote.maintenanceMonthly}/month for hosting, updates and small edits — cancel anytime.

Want me to switch it over? Reply "go" and I'll take care of everything.

Arshaq
Webcules · Saskatoon
webcules.com

P.S. The before/after difference on mobile is the part owners notice first — try the link on your phone.`;

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
    }. It's fixed in the rebuild: ${n(c.previewUrl) || "[preview link]"}. Worth 60 seconds on your phone. — Arshaq`;
  }
  return `Hi ${owner(c)}, last note from me — I take preview sites down after two weeks to keep things tidy. If you'd like a 5-minute walkthrough of what changed (and what it'd take to go live), just reply here. Either way, the audit is yours to keep. — Arshaq, Webcules`;
}
