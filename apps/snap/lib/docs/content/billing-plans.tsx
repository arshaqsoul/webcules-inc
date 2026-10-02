/* Plans & tiers — the honest ladder. Every number is read from
 * lib/plans-data.ts (what the app actually enforces) and the positioning
 * copy from lib/tier-cards.ts (what the pricing page says), so this page
 * cannot drift from either. */
import { H2, H3, Note, Callout, Shot, Tier, Related } from "@/lib/docs/primitives";

export default function BillingPlans() {
  return (
    <>
      <p>
        Four plans, all monthly, all in USD: <strong>Free</strong>, <strong>Lite</strong> ($15/mo),{" "}
        <strong>Studio</strong> ($29/mo), and <strong>Pro</strong> ($59/mo). Every plan runs the
        whole workflow — leads, bookings, projects, galleries, contracts, payments — so the tiers
        differ in capacity and branding, not in features you need to deliver a job. This page is
        the exact ladder the app enforces.
      </p>

      <Shot
        src="/docs-shots/billing-plans/panel.png"
        alt="Settings → Billing: the current plan, live storage usage against the cap, and the four plan cards."
        grad="moss"
      />

      <H2>The ladder</H2>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Free</th>
            <th>Lite</th>
            <th>Studio</th>
            <th>Pro</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Price</td>
            <td>$0</td>
            <td>$15/mo</td>
            <td>$29/mo</td>
            <td>$59/mo</td>
          </tr>
          <tr>
            <td>Storage</td>
            <td>20 GB</td>
            <td>150 GB</td>
            <td>500 GB</td>
            <td>2 TB</td>
          </tr>
          <tr>
            <td>Hard lock (2× storage)</td>
            <td>40 GB</td>
            <td>300 GB</td>
            <td>1 TB</td>
            <td>4 TB</td>
          </tr>
          <tr>
            <td>Storage overage</td>
            <td>—</td>
            <td>—</td>
            <td>$0.10/GB·mo</td>
            <td>$0.10/GB·mo</td>
          </tr>
          <tr>
            <td>Active galleries</td>
            <td>5</td>
            <td>15</td>
            <td>Unlimited</td>
            <td>Unlimited</td>
          </tr>
          <tr>
            <td>Linked studios</td>
            <td>1</td>
            <td>3</td>
            <td>Unlimited</td>
            <td>Unlimited</td>
          </tr>
          <tr>
            <td>Session types</td>
            <td>1</td>
            <td>3</td>
            <td>Unlimited</td>
            <td>Unlimited</td>
          </tr>
          <tr>
            <td>Contract templates</td>
            <td>2</td>
            <td>2</td>
            <td>Unlimited</td>
            <td>Unlimited</td>
          </tr>
          <tr>
            <td>Email snippets</td>
            <td>5</td>
            <td>5</td>
            <td>Unlimited</td>
            <td>Unlimited</td>
          </tr>
          <tr>
            <td>Contact forms</td>
            <td>1</td>
            <td>1</td>
            <td>Unlimited</td>
            <td>Unlimited</td>
          </tr>
          <tr>
            <td>Questionnaires</td>
            <td>1</td>
            <td>3</td>
            <td>Unlimited</td>
            <td>Unlimited</td>
          </tr>
          <tr>
            <td>Team seats</td>
            <td>1</td>
            <td>1</td>
            <td>3</td>
            <td>10</td>
          </tr>
          <tr>
            <td>Custom domains</td>
            <td>—</td>
            <td>—</td>
            <td>+$5/mo add-on</td>
            <td>2 included</td>
          </tr>
          <tr>
            <td>Gallery templates — apply any of the 10</td>
            <td>Included</td>
            <td>Included</td>
            <td>Included</td>
            <td>Included</td>
          </tr>
          <tr>
            <td>Gallery page builder + custom fonts</td>
            <td>—</td>
            <td>Included</td>
            <td>Included</td>
            <td>Included</td>
          </tr>
          <tr>
            <td>Collage sections (unlimited saved looks)</td>
            <td>—</td>
            <td>1 saved look</td>
            <td>Included</td>
            <td>Included</td>
          </tr>
          <tr>
            <td>White-label</td>
            <td>—</td>
            <td>—</td>
            <td>Included</td>
            <td>Included</td>
          </tr>
          <tr>
            <td>RAW files</td>
            <td>3 GB trial</td>
            <td>Unlimited</td>
            <td>Unlimited</td>
            <td>Unlimited</td>
          </tr>
        </tbody>
      </table>
      <Note>
        Bookings are unlimited on every plan, and a 250,000-file ceiling per studio applies at all
        tiers. Quotas pool across your{" "}
        <a href="/docs/concepts">studio family</a> — three studios on Lite share one 150 GB pool
        and one bill, not three.
      </Note>

      <H2>Storage, overage, and the hard lock</H2>
      <p>
        Your storage cap is the plan number. Past it you enter the overage zone, which runs to
        twice the cap — the hard lock. What happens in the zone depends on the tier:
      </p>
      <H3>
        Overage billing <Tier plan="studio" />
      </H3>
      <p>
        On Studio and Pro, storage beyond the cap bills at <strong>$0.10 per GB per month</strong>
        , added to your regular invoice and capped at the price difference to the next tier. On
        Studio, for example: 500 GB included, you are using 620 GB — that&apos;s 120 GB over, so
        $12/mo on your bill. Going $30/mo deep is the signal to move to Pro, because 2 TB at
        $59/mo would cost less.
      </p>
      <H3>Free and Lite</H3>
      <p>
        There is no overage billing on Free and Lite — the zone is simply warning space. The
        billing panel turns amber, and the honest fix is upgrading.
      </p>
      <Callout tone="warn" title="At the hard lock, uploads stop">
        Hit 2× your plan&apos;s storage (40 GB on Free, 300 GB on Lite, 1 TB on Studio, 4 TB on
        Pro) and new uploads are refused. Nothing is deleted: downloads, galleries, and the rest
        of the app keep working normally. Upgrading unlocks uploads immediately.
      </Callout>
      <H3>RAW files</H3>
      <p>
        Free includes a 3 GB RAW trial pocket inside its 20 GB — enough to feel the{" "}
        <a href="/docs/raw-vault">RAW Vault</a>. Lite and above carry RAW with no separate cap;
        RAW simply counts against the storage pool.
      </p>

      <H2>Seats, studios, and domains</H2>
      <p>
        Team seats cover members plus pending invites, and the owner always occupies one — so
        Studio&apos;s 3 seats mean two teammates. Linked studios pool storage and billing under
        the parent&apos;s subscription. Custom domains are per studio: Pro includes two slots,{" "}
        <Tier plan="studio" /> buys one through the $5/mo add-on, and Free and Lite have no
        purchase path. <Tier plan="studio" /> white-labeling removes Snap&apos;s name from
        galleries, emails, and invoices — see <a href="/docs/brand">Brand &amp; white-label</a>.
      </p>

      <H2>Which tier fits</H2>
      <p>
        The pricing page says it straight, and it holds: Free is for trying the whole thing,
        Lite is for part-timers growing, Studio is the working pro&apos;s tier, and Pro is for
        studios and teams. Studio is where most full-time photographers land — white-label,
        unlimited galleries and templates, and a 500 GB pool. Change plans any time from{" "}
        <a href="/dashboard/settings/billing">Settings → Billing</a>; how the money moves is on{" "}
        <a href="/docs/billing">Subscription &amp; billing</a>.
      </p>

      <Related slugs={["billing", "storage", "brand", "raw-vault"]} />
    </>
  );
}
