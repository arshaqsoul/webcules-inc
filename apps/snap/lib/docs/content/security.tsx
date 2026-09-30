/* Security & two-factor — what 2FA protects, how to turn it on, and the
 * no-bypass recovery path. Facts from components/settings-security.tsx,
 * lib/auth.server.ts (WEB-279) and migrations/0053_two_factor.sql. */
import { H2, Note, Callout, Shot, Steps, Related } from "@/lib/docs/primitives";

export default function Security() {
  return (
    <>
      <p>
        Your Snap studio holds client photos and payment relationships. Two-factor adds a second
        lock to sign-in, and because recovery is where accounts actually die, this page states
        plainly how it works: there is deliberately no automated bypass — not for you, not for
        anyone pretending to be you.
      </p>

      <Shot
        src="/docs-shots/security/two-factor-card.png"
        alt="The Two-factor authentication card in Settings → Security, with its On/Off status pill and the Enable two-factor button."
        grad="night"
      />

      <H2>Turn on two-factor</H2>
      <p>
        It takes about two minutes, and any authenticator app works — Google Authenticator,
        1Password, Authy, Microsoft Authenticator.
      </p>
      <Steps
        items={[
          <>
            Open <a href="/dashboard/settings/security">Settings → Security</a> and click{" "}
            <strong>Enable two-factor</strong>. Snap asks for your password to start.
          </>,
          <>
            <strong>Scan the QR code</strong> with your authenticator app — or paste the secret
            manually if you can't scan. Enter the 6-digit code the app shows and click{" "}
            <strong>Verify and turn on</strong>.
          </>,
          <>
            <strong>Save your backup codes</strong> — ten codes, shown once. Use{" "}
            <strong>Download .txt</strong>, keep the file somewhere safe, then click{" "}
            <strong>I've saved them</strong>.
          </>,
        ]}
      />
      <p>
        From then on, every sign-in asks for your password <em>and</em> a code. There's no
        "remember this device" option — the code is asked every time, which is the point.
      </p>
      <Note>
        Two-factor protects a personal login, not the studio: each team member enables it on
        their own account.
      </Note>

      <H2>Backup codes</H2>
      <p>
        Each backup code works exactly once — for a broken phone, a wiped authenticator, or a
        device you don't trust with your secrets. They're shown once at setup and never again,
        which is why the download button exists. Used one, or lost the file? Click{" "}
        <strong>Regenerate backup codes</strong> on the same settings page (it asks for your
        password): a fresh set appears and the old codes stop working immediately.
      </p>

      <H2>What changes when it's on</H2>
      <ul>
        <li>
          <strong>Enabling signs out every other session.</strong> Anything still signed in with
          just a password has to pass the code check too.
        </li>
        <li>
          <strong>A password reset revokes all active sessions,</strong> so a stolen session can
          never outlive a recovered account.
        </li>
        <li>
          <strong>Wrong codes have consequences:</strong> code verification is rate-limited, and
          repeated failures lock it briefly.
        </li>
        <li>
          <strong>Secrets are stored encrypted</strong> — both the authenticator secret and the
          backup codes — and every enable, disable, and backup-code use is written to the audit
          log.
        </li>
      </ul>

      <H2>Lost device and recovery</H2>
      <p>
        If you still have backup codes: sign in with your password plus any remaining code, then
        re-enroll a new authenticator from{" "}
        <a href="/dashboard/settings/security">Settings → Security</a>.
      </p>
      <p>
        If you've lost both the device and every code, email{" "}
        <a href="mailto:hello@snap.webcules.com">hello@snap.webcules.com</a> from your account's
        email address. We verify your identity before resetting two-factor — there is no
        self-serve bypass, because anything a thief could click through wouldn't be security at
        all.
      </p>
      <Callout tone="warn" title="Turning it off is deliberate, not accidental">
        Disabling two-factor requires a valid code <em>and</em> your password — a backup code
        works there too. Someone who has your password but not your device can't switch the
        second lock off.
      </Callout>

      <Related slugs={["notifications", "start-guide"]} />
    </>
  );
}
