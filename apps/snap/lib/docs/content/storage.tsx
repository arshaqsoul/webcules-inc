/* Storage & limits — the plan storage pool: what counts, family pooling,
 * the overage zone, the hard lock, and the monthly upload bound. Facts from
 * lib/plans-data.ts (plan table), lib/plans.ts (getPlanEntitlements,
 * family pooling), lib/uploads.ts (checkUploadGate) and
 * components/plan-panel.tsx (Settings → Billing usage bar). */
import { H2, H3, Note, Tier, Related } from "@/lib/docs/primitives";

export default function Storage() {
  return (
    <>
      <p>
        Every plan includes one storage pool, and everything you store draws from it. This page is
        the exact math: what counts, what happens near the cap, and where the line is that refuses
        an upload.
      </p>

      <H2>What counts against the pool</H2>
      <p>
        Every stored file: <strong>photos, videos, and RAWs</strong> alike — there is no separate
        RAW quota (see <a href="/docs/raw-vault">RAW Vault</a> for how RAWs age into cold storage,
        which doesn't change what they count). The <em>derivatives</em> Snap makes for you —
        preview images, watermarked copies, thumbnails — don't count; only your original files do.
        Deleting a file releases its space immediately.
      </p>
      <Note>
        Per-file ceilings: photos and RAW up to 5 GB, videos up to 4 GB. Free is
        JPG-photos-only (plus the 3 GB RAW trial pocket); video needs a paid plan.
      </Note>

      <H2>One pool per studio family</H2>
      <p>
        Linked studios share a single envelope: the plan comes from the family root, and usage
        sums across every studio in the family. Three studios on Lite share{" "}
        <strong>one</strong> 150 GB pool, not three. Custom-domain slots are the exception — each
        studio configures its own. The family itself is covered in{" "}
        <a href="/docs/billing-plans">plans &amp; tiers</a>.
      </p>

      <H2>The numbers</H2>
      <table>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Included</th>
            <th>Hard lock (2×)</th>
            <th>Overage</th>
            <th>Monthly uploads</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Free</td>
            <td>20 GB</td>
            <td>40 GB</td>
            <td>—</td>
            <td>40 GB</td>
          </tr>
          <tr>
            <td>Lite</td>
            <td>150 GB</td>
            <td>300 GB</td>
            <td>—</td>
            <td>300 GB</td>
          </tr>
          <tr>
            <td>Studio</td>
            <td>500 GB</td>
            <td>1 TB</td>
            <td>$0.10/GB-mo</td>
            <td>1 TB</td>
          </tr>
          <tr>
            <td>Pro</td>
            <td>2 TB</td>
            <td>4 TB</td>
            <td>$0.10/GB-mo</td>
            <td>4 TB</td>
          </tr>
        </tbody>
      </table>
      <p>
        All four tiers share one more ceiling: <strong>250,000 files</strong> per organization.
      </p>

      <H2>
        Approaching the cap: the overage zone <Tier plan="studio" />
      </H2>
      <p>
        Past your included storage there's headroom up to the hard lock. On Studio and Pro that
        headroom is billed as overage: <strong>$0.10 per GB per month</strong> beyond your cap,
        charged monthly and capped at the next tier's price difference — so a heavy Studio month
        can never cost more than just upgrading. On Free and Lite the zone is unbilled breathing
        room; the charge is Studio-and-above only.
      </p>

      <H3>The hard lock</H3>
      <p>
        At twice your included storage, the gates close: <strong>new uploads are refused</strong> —
        photos, videos, and RAW alike — with a clear "storage locked" error. Nothing existing is
        touched: galleries keep working, clients keep browsing and downloading. The lock lifts the
        moment you free space or upgrade (each plan's lock is 2× its own included pool).
      </p>

      <H3>The monthly upload bound</H3>
      <p>
        Independent of the pool, uploads per calendar month are capped at twice your included
        storage (resetting on the 1st, UTC). It's a churn guard — you can't fill and re-fill a
        locked pool indefinitely — and hitting it is a "come back next month" moment, not a bill.
      </p>

      <H2>Watching your usage</H2>
      <p>
        <a href="/dashboard/settings/billing">Settings → Billing</a> shows the live bar: percent
        of plan storage used, the lock marked at the end, amber as you near the cap and red at the
        lock, with the overage math spelled out when you're in the zone. Free additionally shows
        the RAW trial pocket separately.
      </p>

      <Related slugs={["billing-plans", "raw-vault", "billing"]} />
    </>
  );
}
