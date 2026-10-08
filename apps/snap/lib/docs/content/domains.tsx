/* Custom domains — restructured from app/docs/domains/page.tsx (WEB-224/232;
 * approved copy preserved): the DNS walkthrough for non-technical studios.
 * The record blocks mirror exactly what the settings panel renders — same
 * CNAME_TARGET constant from lib/domains. */
import { H2, H3, Callout, Steps, Tier, Related } from "@/lib/docs/primitives";

import { DocsCode } from "@/components/docs-code";
import { CNAME_TARGET } from "@/lib/domains";
import { PUBLIC_HOST, PUBLIC_ORIGIN, emailAddress } from "@/lib/hosts";

export default function Domains() {
  return (
    <>
      <p>
        A custom domain puts your client surface on your branding — the gallery links you email,
        the booking page, and the client portal all move to a hostname like{" "}
        <code>gallery.yourstudio.com</code>. Add one under{" "}
        <a href="/dashboard/settings/domains">Settings → Domains</a> and paste two DNS records at
        your provider; every common provider is walked through below.
      </p>

      <H2>What you get</H2>
      <p>Every client link you send can live on your own hostname instead of the standard address:</p>
      <DocsCode
        label="Before → after"
        code={`${PUBLIC_ORIGIN}/g/abc123def456\nhttps://gallery.brightlightstudio.com/g/abc123def456`}
      />
      <p>
        <strong>Subdomains only.</strong> You point a hostname like <code>gallery.yourstudio.com</code>{" "}
        or <code>photos.yourstudio.com</code> — not <code>yourstudio.com</code> itself. The root of
        your domain can't be a CNAME (it's how DNS works — apex records must be IP addresses), and
        your website lives there anyway. <code>gallery.</code>, <code>photos.</code>,{" "}
        <code>clients.</code> or <code>book.</code> are the popular choices.
      </p>

      <H2>The three steps</H2>
      <Steps
        items={[
          <>
            <strong>Add the domain</strong> in Settings → Domains. Snap immediately shows the DNS
            records it needs — a CNAME pointing your hostname at{" "}
            <code>{CNAME_TARGET}</code>, and a TXT record on{" "}
            <code>_snap-verify.gallery.yourstudio.com</code> holding your personal{" "}
            <code>snap-verify=</code> token. Nothing else is needed for the certificate: once the
            CNAME is in place Cloudflare issues it automatically.
          </>,
          <>
            <strong>Add the records at your DNS provider</strong> — provider-specific walkthroughs
            below. Use the copy buttons in Settings so nothing gets mistyped.
          </>,
          <>
            <strong>Come back and press "Check status".</strong> DNS usually updates in minutes but
            can take 24–48 hours. The page re-checks automatically every 10 seconds while a domain
            is pending, and we email you if a previously-working domain ever breaks.
          </>,
        ]}
      />

      <H2>Provider walkthroughs</H2>
      <p>
        The screens differ slightly per provider, but every one has the same three fields: type
        (CNAME or TXT), name, and value. Your Settings → Domains page shows the exact values —
        these guides are about finding the right screen.
      </p>

      <H3>Cloudflare — one critical step</H3>
      <ol>
        <li>
          Dashboard → your domain → <strong>DNS → Records → Add record</strong>. Type{" "}
          <code>CNAME</code>, Name <code>gallery</code> (just the part before your domain), Target{" "}
          <code>{CNAME_TARGET}</code>, TTL Auto.
        </li>
        <li>Add the TXT record the same way: Type <code>TXT</code>, Name <code>_snap-verify.gallery</code>, paste the token value.</li>
      </ol>
      <Callout tone="warn" title="Turn the proxy OFF — grey cloud">
        The record must be "DNS only": an orange (proxied) cloud hides the CNAME from Snap's
        verification and breaks activation. This is the #1 Cloudflare gotcha.
      </Callout>

      <H3>GoDaddy</H3>
      <ol>
        <li>My Products → your domain → <strong>DNS → Manage Zones</strong> (or "Manage DNS").</li>
        <li>
          <strong>Add record</strong>: Type <code>CNAME</code>, Name <code>gallery</code>, Value{" "}
          <code>{CNAME_TARGET}</code>, TTL 1 Hour.
        </li>
        <li>Add again: Type <code>TXT</code>, Name <code>_snap-verify.gallery</code>, Value the token from Settings.</li>
        <li>Save both — GoDaddy applies them within minutes.</li>
      </ol>

      <H3>Namecheap</H3>
      <ol>
        <li>Domain List → Manage → <strong>Advanced DNS → Add New Record</strong>.</li>
        <li>Type <code>CNAME Record</code>, Host <code>gallery</code>, Value <code>{CNAME_TARGET}</code>, TTL Automatic.</li>
        <li>Add the TXT: Type <code>TXT Record</code>, Host <code>_snap-verify.gallery</code>, Value the token.</li>
      </ol>

      <H3>Squarespace</H3>
      <ol>
        <li>
          Settings → Domains → your domain → <strong>DNS → Custom Records → Add Record</strong>.
          (Move the domain to Squarespace DNS first if it's only parked there.)
        </li>
        <li>Type <code>CNAME</code>, Host <code>gallery</code>, Data <code>{CNAME_TARGET}</code>.</li>
        <li>Add the TXT record with Host <code>_snap-verify.gallery</code> and the token as Data.</li>
      </ol>

      <H3>Wix</H3>
      <ol>
        <li>Domain Settings → <strong>DNS Records → Add Record</strong> (under "Manage DNS").</li>
        <li>Type <code>CNAME</code>, Host Name <code>gallery</code>, Value <code>{CNAME_TARGET}</code>, TTL 1 Hour.</li>
        <li>Add the TXT with Host Name <code>_snap-verify.gallery</code> and the token as Value.</li>
      </ol>

      <H3>WordPress.com</H3>
      <ol>
        <li>
          Domains → your domain → <strong>DNS Records → New DNS Record</strong>. Custom DNS
          requires a paid plan on the domain.
        </li>
        <li>Type <code>CNAME</code>, Name <code>gallery</code>, Alias To <code>{CNAME_TARGET}</code>.</li>
        <li>Add the TXT with Name <code>_snap-verify.gallery</code> and the token as Text.</li>
      </ol>

      <H3>Any other provider</H3>
      <ol>
        <li>Find the DNS / zone-file / records section of your domain's control panel.</li>
        <li>
          Create a CNAME with the full hostname <code>gallery.yourstudio.com</code> pointing at{" "}
          <code>{CNAME_TARGET}</code>.
        </li>
        <li>Create a TXT record on <code>_snap-verify.gallery.yourstudio.com</code> with the token as its value.</li>
        <li>
          If your provider asks for "just the name", enter the part before your domain (
          <code>gallery</code> and <code>_snap-verify.gallery</code>).
        </li>
      </ol>

      <H2>What the statuses mean</H2>
      <ul>
        <li>
          <strong>Pending verification</strong> — we can't see your DNS records yet. They're
          usually live within minutes; press Check status after adding them.
        </li>
        <li>
          <strong>Certificate issuing</strong> — ownership proven; the HTTPS certificate for your
          hostname is being issued. Typically minutes.
        </li>
        <li>
          <strong>Active</strong> — live. Your gallery emails, booking page and client portal now
          use this hostname.
        </li>
        <li>
          <strong>Action needed / Degraded</strong> — the DNS stopped pointing at Snap (or the
          certificate can't renew). The exact fix is shown in Settings and emailed to you.
        </li>
      </ul>

      <H2>FAQ</H2>
      <p>
        <strong>Can I use my root domain (yourstudio.com)?</strong> No — subdomains only
        (gallery.yourstudio.com). Apex domains can't CNAME, and your website lives at the root
        anyway. Pick a prefix: gallery., photos., clients., book.
      </p>
      <p>
        <strong>What happens to links I already sent?</strong> They keep working forever — the
        standard {PUBLIC_HOST} links never go away. New links you send simply use your domain.
      </p>
      <p>
        <strong>I'm moving from Pixieset — can I reuse the same subdomain?</strong> Yes. Delete the
        old provider's CNAME, point yours at Snap, verify — usually done in minutes with zero
        client-visible downtime.
      </p>
      <p>
        <strong>Is HTTPS included?</strong> Yes — the certificate issues automatically as part of
        activation. Nothing to buy or renew.
      </p>
      <p>
        <strong>I run multiple studios — one domain each?</strong> Each studio in your family
        configures its own domains in its own Settings → Domains.
      </p>
      <p>
        <strong>What does it cost?</strong> On Studio, a custom domain is the +$5/mo add-on for
        one — billed on your existing subscription. Need several domains? <a href="https://cal.com/webcules/snap">Talk to us</a>.
      </p>

      <H2>Troubleshooting</H2>
      <ul>
        <li>
          <strong>Verification won't pass:</strong> the TXT value must match exactly — including
          the <code>snap-verify=</code> prefix — with no extra quotes or spaces. Re-copy it from
          Settings.
        </li>
        <li>
          <strong>On Cloudflare:</strong> the CNAME must be grey-cloud (DNS only). Orange clouds
          hide it from verification.
        </li>
        <li>
          <strong>CAA records:</strong> if your domain has CAA records listing only certain
          certificate authorities, the HTTPS certificate can't issue. Allow Google Trust Services
          (and Let's Encrypt) in your CAA records, or remove them.
        </li>
        <li>
          <strong>Certificate stuck for over 30 minutes:</strong> double-check the CNAME resolves
          (dig/nslookup), then press Check status again. Still stuck?{" "}
          <a href={`mailto:${emailAddress("hello")}`}>{emailAddress("hello")}</a>.
        </li>
      </ul>
      <Related slugs={["brand", "embeds", "booking-page"]} />
    </>
  );
}
