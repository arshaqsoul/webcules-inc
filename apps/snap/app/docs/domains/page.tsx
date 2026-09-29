/* Custom domains guide (WEB-224/232) — the DNS walkthrough for
 * non-technical studios, matching the embeds docs structure. The record
 * block mirrors EXACTLY what the settings panel renders (same CNAME target
 * constant); statuses and FAQ follow the same lifecycle vocabulary. */
import type { Metadata } from "next";
import Link from "next/link";

import { DocsCode } from "@/components/docs-code";
import { CNAME_TARGET } from "@/lib/domains";
import { SnapMark } from "@/components/snap-mark";

export const metadata: Metadata = {
  title: "Custom domains — Snap guide",
  description:
    "Put your client galleries, booking page and client portal on your own domain (gallery.yourstudio.com): the 3 steps, provider-specific DNS walkthroughs, and status meanings.",
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[17px] font-semibold tracking-[-.3px] text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Guide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-4">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-subtle">{children}</ol>
    </div>
  );
}

const SECTIONS = [
  { id: "what-you-get", label: "What you get" },
  { id: "steps", label: "The 3 steps" },
  { id: "providers", label: "DNS providers" },
  { id: "statuses", label: "Statuses" },
  { id: "faq", label: "FAQ" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

export default function DomainsDocsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <SnapMark className="h-5 w-5" />
          <span className="text-sm font-medium text-ink">Snap docs</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-[-.8px] text-ink">Your galleries on your own domain</h1>
        <p className="text-sm leading-relaxed text-ink-subtle">
          A custom domain puts your client surface on your branding — the gallery links you email, the booking page,
          and the client portal. Add it under{" "}
          <Link href="/dashboard/settings/domains" className="text-primary hover:underline">
            Settings → Domains
          </Link>
          . Also see the{" "}
          <Link href="/docs/embeds" className="text-primary hover:underline">
            embed guide
          </Link>{" "}
          for putting widgets on your website.
        </p>
        <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-hairline bg-surface-1 px-3.5 py-1.5 text-[13px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="what-you-get" title="What you get">
        <p className="text-sm leading-relaxed text-ink-subtle">
          Every client link you send can live on your own hostname instead of the standard snap.webcules.com address:
        </p>
        <DocsCode
          label="Before → after"
          code={`https://snap.webcules.com/g/abc123def456\nhttps://gallery.brightlightstudio.com/g/abc123def456`}
        />
        <p className="text-sm leading-relaxed text-ink-subtle">
          <strong className="text-ink">Subdomains only.</strong> You point a hostname like{" "}
          <code>gallery.yourstudio.com</code> or <code>photos.yourstudio.com</code> — not{" "}
          <code>yourstudio.com</code> itself. The root of your domain can&apos;t be a CNAME (it&apos;s how DNS works —
          apex records must be IP addresses), and your website lives there anyway. <code>gallery.</code>,{" "}
          <code>photos.</code>, <code>clients.</code> or <code>book.</code> are the popular choices.
        </p>
      </Section>

      <Section id="steps" title="The 3 steps">
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-ink-subtle">
          <li>
            <strong className="text-ink">Add the domain</strong> in Settings → Domains. Snap immediately shows you the
            DNS records it needs — like these:
          </li>
        </ol>
        <DocsCode
          label="Record 1 — points the hostname at Snap"
          code={`CNAME  gallery.yourstudio.com  →  ${CNAME_TARGET}`}
        />
        <DocsCode
          label="Record 2 — proves the domain is yours"
          code={`TXT  _snap-verify.gallery.yourstudio.com  =  "snap-verify=your-token-here"`}
        />
        <p className="text-xs text-ink-tertiary">
          (A third TXT record for certificate validation appears too when Cloudflare requires one — copy whatever the
          settings page shows; it&apos;s always the exact set you need.)
        </p>
        <ol start={2} className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-ink-subtle">
          <li>
            <strong className="text-ink">Add the records at your DNS provider</strong> — provider-specific steps below.
            Use the copy buttons in Settings so nothing gets mistyped.
          </li>
          <li>
            <strong className="text-ink">Come back and press “Check status”.</strong> DNS usually updates in minutes
            but can take up to 24–48 hours. The page also re-checks automatically every 10 seconds while a domain is
            pending, and we email you if a previously-working domain ever breaks.
          </li>
        </ol>
      </Section>

      <Section id="providers" title="Provider walkthroughs">
        <p className="text-sm text-ink-subtle">
          The screens differ slightly per provider, but every one has the same three fields: type (CNAME or TXT),
          name, and value. Your Settings → Domains page shows the exact values — these guides are about finding the
          right screen.
        </p>

        <Guide title="Cloudflare — one critical step">
          <li>
            Dashboard → your domain → <strong>DNS → Records → Add record</strong>. Type <code>CNAME</code>, Name{" "}
            <code>gallery</code> (just the part before your domain), Target <code>{CNAME_TARGET}</code>, TTL Auto.
          </li>
          <li>
            <strong className="text-amber-600 dark:text-amber-400">Turn the proxy OFF — grey cloud.</strong> The
            record must be &quot;DNS only&quot;: an orange (proxied) cloud hides the CNAME from Snap&apos;s
            verification and breaks activation. This is the #1 Cloudflare gotcha.
          </li>
          <li>Add the TXT record the same way: Type <code>TXT</code>, Name <code>_snap-verify.gallery</code>, paste the token value.</li>
        </Guide>

        <Guide title="GoDaddy">
          <li>My Products → your domain → <strong>DNS → Manage Zones</strong> (or &quot;Manage DNS&quot;).</li>
          <li>
            <strong>Add record</strong>: Type <code>CNAME</code>, Name <code>gallery</code>, Value{" "}
            <code>{CNAME_TARGET}</code>, TTL 1 Hour.
          </li>
          <li>Add again: Type <code>TXT</code>, Name <code>_snap-verify.gallery</code>, Value the token from Settings.</li>
          <li>Save both — GoDaddy applies them within minutes.</li>
        </Guide>

        <Guide title="Namecheap">
          <li>Domain List → Manage → <strong>Advanced DNS → Add New Record</strong>.</li>
          <li>Type <code>CNAME Record</code>, Host <code>gallery</code>, Value <code>{CNAME_TARGET}</code>, TTL Automatic.</li>
          <li>Add the TXT: Type <code>TXT Record</code>, Host <code>_snap-verify.gallery</code>, Value the token.</li>
        </Guide>

        <Guide title="Squarespace">
          <li>Settings → Domains → your domain → <strong>DNS → Custom Records → Add Record</strong>. (Move the domain to Squarespace DNS first if it&apos;s only parked there.)</li>
          <li>Type <code>CNAME</code>, Host <code>gallery</code>, Data <code>{CNAME_TARGET}</code>.</li>
          <li>Add the TXT record with Host <code>_snap-verify.gallery</code> and the token as Data.</li>
        </Guide>

        <Guide title="Wix">
          <li>Domain Settings → <strong>DNS Records → Add Record</strong> (under &quot;Manage DNS&quot;).</li>
          <li>Type <code>CNAME</code>, Host Name <code>gallery</code>, Value <code>{CNAME_TARGET}</code>, TTL 1 Hour.</li>
          <li>Add the TXT with Host Name <code>_snap-verify.gallery</code> and the token as Value.</li>
        </Guide>

        <Guide title="WordPress.com">
          <li>Domains → your domain → <strong>DNS Records → New DNS Record</strong>. Custom DNS requires a paid plan on the domain.</li>
          <li>Type <code>CNAME</code>, Name <code>gallery</code>, Alias To <code>{CNAME_TARGET}</code>.</li>
          <li>Add the TXT with Name <code>_snap-verify.gallery</code> and the token as Text.</li>
        </Guide>

        <Guide title="Any other provider">
          <li>Find the DNS / zone-file / records section of your domain&apos;s control panel.</li>
          <li>Create a CNAME with the full hostname <code>gallery.yourstudio.com</code> pointing at <code>{CNAME_TARGET}</code>.</li>
          <li>Create a TXT record on <code>_snap-verify.gallery.yourstudio.com</code> with the token as its value.</li>
          <li>If your provider asks for &quot;just the name&quot;, enter the part before your domain (<code>gallery</code> and <code>_snap-verify.gallery</code>).</li>
        </Guide>
      </Section>

      <Section id="statuses" title="What the statuses mean">
        <dl className="flex flex-col gap-2.5 text-sm">
          {[
            ["Pending verification", "We can't see your DNS records yet. They're usually live within minutes; press Check status after adding them."],
            ["Certificate issuing", "Ownership proven — Cloudflare is issuing the HTTPS certificate for your hostname. Typically minutes."],
            ["Active", "Live. Your gallery emails, booking page and client portal now use this hostname."],
            ["Action needed / Degraded", "The DNS stopped pointing at Snap (or the certificate can't renew). The exact fix is shown in Settings and emailed to you."],
          ].map(([term, def]) => (
            <div key={term} className="flex flex-col gap-0.5">
              <dt className="font-medium text-ink">{term}</dt>
              <dd className="text-[13.5px] leading-relaxed text-ink-subtle">{def}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="faq" title="FAQ">
        <dl className="flex flex-col gap-3 text-sm">
          {[
            ["Can I use my root domain (yourstudio.com)?", "No — subdomains only (gallery.yourstudio.com). Apex domains can't CNAME, and your website lives at the root anyway. Pick a prefix: gallery., photos., clients., book."],
            ["What happens to links I already sent?", "They keep working forever — the standard snap.webcules.com links never go away. New links you send simply use your domain."],
            ["I'm moving from Pixieset — can I reuse the same subdomain?", "Yes. Delete the old provider's CNAME, point yours at Snap, verify — usually done in minutes with zero client-visible downtime."],
            ["Is HTTPS included?", "Yes — the certificate issues automatically as part of activation. Nothing to buy or renew."],
            ["I run multiple studios — one domain each?", "Each studio in your family configures its own domains in its own Settings → Domains."],
            ["What does it cost?", "Included with Pro (2 domains). On Studio, +$5/mo for one domain — billed on your existing subscription."],
          ].map(([q, a]) => (
            <div key={q} className="flex flex-col gap-0.5">
              <dt className="font-medium text-ink">{q}</dt>
              <dd className="text-[13.5px] leading-relaxed text-ink-subtle">{a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="troubleshooting" title="Troubleshooting">
        <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-subtle">
          <li>
            <strong className="text-ink">Verification won&apos;t pass:</strong> the TXT value must match exactly —
            including the <code>snap-verify=</code> prefix — with no extra quotes or spaces. Re-copy it from Settings.
          </li>
          <li>
            <strong className="text-ink">On Cloudflare:</strong> the CNAME must be grey-cloud (DNS only). Orange
            clouds hide it from verification.
          </li>
          <li>
            <strong className="text-ink">CAA records:</strong> if your domain has CAA records listing only certain
            certificate authorities, the HTTPS certificate can&apos;t issue. Allow Google Trust Services (and
            Let&apos;s Encrypt) in your CAA records, or remove them.
          </li>
          <li>
            <strong className="text-ink">Certificate stuck for over 30 minutes:</strong> double-check the CNAME
            resolves (dig/nslookup), then press Check status again. Still stuck?{" "}
            <a href="mailto:hello@snap.webcules.com" className="text-primary hover:underline">hello@snap.webcules.com</a>.
          </li>
        </ul>
      </Section>
    </div>
  );
}
