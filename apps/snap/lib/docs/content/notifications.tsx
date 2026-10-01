/* Notifications — the Settings → Notifications card (WEB-278): nine studio
 * alert toggles, the new-client email default, and the honest split between
 * alerts to you (mutable) and client transactional email (never suppressible).
 * Facts from components/settings-notifications.tsx, lib/notify-client.ts,
 * app/api/cron/daily-status/route.ts and migrations/0054_notification_defaults.sql.
 * WEB-303: the same toggles now also govern which events mint inbox items
 * (lib/inbox/sources.ts) — the inbox surface itself ships separately. */
import { H2, Callout, Shot, Related } from "@/lib/docs/primitives";

export default function Notifications() {
  return (
    <>
      <p>
        Two email streams leave Snap: alerts to <em>you</em>, and email to your <em>clients</em>.
        The first kind is yours to mute. The second is deliberately not — a gallery link that
        never arrives is a client who never sees their photos.
      </p>

      <Shot
        src="/docs-shots/notifications/settings.png"
        alt="The Settings → Notifications card: studio alert toggles, the new-client email default, and a Save notifications button."
        grad="moss"
      />

      <H2>Studio alerts</H2>
      <p>
        <a href="/dashboard/settings/notifications">Settings → Notifications</a> lists nine alerts,
        all on by default. Each one is an email to your studio's contact address — the inbox you
        gave when you signed up. Studio admins can flip any of them off; the change applies from
        the next send onward.
      </p>
      <table>
        <thead>
          <tr>
            <th>Alert</th>
            <th>Fires when</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>New inquiries</strong>
            </td>
            <td>Booking page or contact-form submissions, client email replies</td>
          </tr>
          <tr>
            <td>
              <strong>New bookings</strong>
            </td>
            <td>A paid booking lands through your booking page</td>
          </tr>
          <tr>
            <td>
              <strong>Booking changes</strong>
            </td>
            <td>Client reschedules or cancels</td>
          </tr>
          <tr>
            <td>
              <strong>Contract activity</strong>
            </td>
            <td>A contract goes out or comes back signed</td>
          </tr>
          <tr>
            <td>
              <strong>Payments</strong>
            </td>
            <td>Invoices paid or payments refunded</td>
          </tr>
          <tr>
            <td>
              <strong>Gallery activity</strong>
            </td>
            <td>A gallery is delivered or first viewed by the client</td>
          </tr>
          <tr>
            <td>
              <strong>Orders</strong>
            </td>
            <td>Client orders paid or shipped</td>
          </tr>
          <tr>
            <td>
              <strong>Storage warnings</strong>
            </td>
            <td>Storage crosses 90% of your plan</td>
          </tr>
          <tr>
            <td>
              <strong>RAW Vault notices</strong>
            </td>
            <td>Archive confirmations, purge warnings, renewals</td>
          </tr>
        </tbody>
      </table>

      <H2>The stream that never turns off</H2>
      <p>
        Nothing above touches client email. Contract signing links, invoices, and receipts always
        send — no setting in Snap can suppress them, because they're the paper trail of your
        business, not notifications about it. The studio toggles govern one thing only: whether{" "}
        <em>you</em> hear about it.
      </p>

      <H2>The per-client opt-out</H2>
      <p>
        Clients can trim the rest themselves. From their{" "}
        <a href="/docs/client-portal">client portal</a>, each client can switch off the
        keep-in-touch email from your studio — gallery links, booking confirmations, and delivery
        notices (booking reminders and reschedule or cancellation notices included). Two things
        stay true when they do: the gallery itself stays live and visible in their portal — only
        the notification email stops — and the change takes effect on the next send. There's no
        queue to drain.
      </p>
      <p>
        Your one control over it is the default. The <strong>New client emails</strong> section of
        the same settings page holds a single toggle — <strong>New clients receive gallery &amp;
        booking emails</strong> — which sets the starting state for client records created from
        now on. Existing clients keep their own setting regardless; nothing you do here overrides
        a choice they already made.
      </p>
      <Callout tone="warn" title="Muting yourself is not muting them">
        Turn every studio alert off and your clients' email is untouched. A client opts out and
        your alerts still arrive. The two streams never mix.
      </Callout>

      <Related slugs={["security", "gallery-delivery", "client-portal"]} />
    </>
  );
}
