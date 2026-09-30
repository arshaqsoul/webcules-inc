/* RAW Vault — the RAW retention lifecycle (WEB-153): 6 months hot, then
 * R2 Infrequent Access, restore/keep-hot on demand, purge only after two
 * emailed warnings. Facts from lib/vault.ts, components/raw-vault-panel.tsx
 * and app/dashboard/raw-vault/page.tsx; plan gates from lib/plans-data.ts
 * and lib/uploads.ts. */
import { H2, Note, Shot, Steps, Tier, Related } from "@/lib/docs/primitives";

export default function RawVault() {
  return (
    <>
      <p>
        The RAW Vault keeps your RAW files hot while you work, then lets them slide into cheap
        cold storage automatically — still fully downloadable, restorable with one click, and
        never deleted without warnings you get by email first. You'll find it at{" "}
        <a href="/dashboard/raw-vault">Dashboard → RAW Vault</a>.
      </p>

      <Shot
        src="/docs-shots/raw-vault/panel.png"
        alt="The RAW Vault dashboard: hot and cold storage totals, per-project rows with their next lifecycle date, and the restore action."
        grad="night"
      />

      <H2>The lifecycle</H2>
      <Steps
        items={[
          <>
            <strong>Hot for 6 months.</strong> Every RAW you upload stays in fast storage, ready
            to open and deliver from. Nothing to do, nothing to remember.
          </>,
          <>
            <strong>A heads-up at month five.</strong> About 150 days after upload you get one
            email listing what's approaching the end of its hot window and when it will move.
          </>,
          <>
            <strong>Archive to cold storage.</strong> After the 6 months, the files move to R2
            Infrequent Access — slower to first byte, far cheaper, and every bit still there.
            Downloads work exactly as before.
          </>,
        ]}
      />
      <p>
        The move runs itself in a daily sweep — there is no manual archiving and no way to get it
        wrong. JPGs, videos, and every other file kind are never touched by the Vault.
      </p>

      <H2>Restore and keep hot</H2>
      <p>
        Back on a project? One click in the Vault restores archived RAWs to hot storage with a
        fresh 6-month window — per project or everything at once. For files still hot, the same
        action is <strong>keep hot 6 more months</strong>, and it resets the countdown even before
        the month-five email arrived. Every restore is written to the project's activity trail.
      </p>

      <H2>Deletion is never a surprise</H2>
      <p>
        Archived RAWs aren't kept forever. The exit is slow and loud: a first warning email at day
        60 in cold storage, a final one at day 80, and deletion only at day 90 (plus a grace
        period after that final email). Two rules harden it:
      </p>
      <ul>
        <li>
          RAWs inside a <strong>live gallery</strong> are skipped — a client's open gallery never
          loses its files; they're re-checked each run and purged only once unshared.
        </li>
        <li>
          Restoring at any point before deletion cancels the countdown completely.
        </li>
      </ul>

      <H2>Who sees the Vault</H2>
      <p>
        Owners and admins always do. Team members see it only if the studio opts them in under{" "}
        <a href="/dashboard/settings/team">Settings → Team</a> — the panel shows hot and cold
        totals, a per-project breakdown with each project's next lifecycle date ("Hot until",
        "Archives on", "Deletes on"), and the earliest upcoming purge.
      </p>

      <H2>What it counts against</H2>
      <p>
        RAW bytes live in the same storage pool as everything else — they don't have a separate
        quota. What changes by plan is whether RAW uploads are allowed at all: Lite{" "}
        <Tier plan="lite" /> and above take RAW without a RAW-specific cap, while Free includes a
        small 3 GB trial pocket (inside its 20 GB pool) so you can feel the Vault before
        upgrading. The exact numbers are in <a href="/docs/storage">storage &amp; limits</a>.
      </p>
      <Note>
        The lifecycle emails are branded with your studio and can be muted as a group in{" "}
        <a href="/docs/notifications">notification settings</a> — but read them; they're the
        purge warnings.
      </Note>

      <Related slugs={["storage", "billing-plans", "projects"]} />
    </>
  );
}
