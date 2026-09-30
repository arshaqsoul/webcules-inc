"use client";

/* Settings → Security (WEB-279): TOTP two-factor + single-use backup codes.
 * Flows: enable (password → QR → live-code verify → backup codes shown once),
 * regenerate codes (password + confirm), disable (code + password). Enabling
 * revokes all other sessions server-side (auth hook). */
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import QRCode from "react-qr-code";

import { Button } from "@webcules/ui/components/button";
import { DocHint } from "@/components/doc-hint";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

import { authClient } from "@/lib/auth-client";

type Setup = { totpURI: string; backupCodes: string[] };

function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

function downloadBackupCodes(codes: string[]) {
  const blob = new Blob(
    [
      "Snap two-factor backup codes\n",
      "Each code works once. Store this file somewhere safe.\n\n",
      codes.map((c, i) => `${i + 1}. ${c}`).join("\n"),
      "\n",
    ],
    { type: "text/plain" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "snap-backup-codes.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}

function BackupCodesView({ codes, onDone, doneLabel }: { codes: string[]; onDone: () => void; doneLabel: string }) {
  return (
    <div className="mt-4 rounded-lg border border-hairline bg-background p-4">
      <p className="text-sm font-medium text-ink">Save your backup codes now</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-subtle">
        Each code works exactly once if you lose your authenticator device. They won&apos;t be shown again.
      </p>
      <ol className="mt-3 grid gap-1 font-mono text-sm text-ink sm:grid-cols-2">
        {codes.map((c) => (
          <li key={c} className="rounded border border-hairline px-2 py-1">
            {c}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => downloadBackupCodes(codes)}>
          Download .txt
        </Button>
        <Button size="sm" onClick={onDone}>
          {doneLabel}
        </Button>
      </div>
    </div>
  );
}

export function SettingsSecurity({ twoFactorEnabled: initialEnabled }: { twoFactorEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<"idle" | "password" | "scan" | "codes">("idle");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secret = useMemo(() => (setup ? secretFromUri(setup.totpURI) : ""), [setup]);

  async function startEnable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    setPassword("");
    if (error || !data || data.method !== "totp") {
      setError(error?.message || "Couldn't start — check your password.");
      return;
    }
    setSetup({ totpURI: data.totpURI, backupCodes: data.backupCodes });
    setStep("scan");
  }

  async function verifySetupCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!setup) return;
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim().replace(/\s+/g, "") });
    setBusy(false);
    if (error) {
      setError("That code didn't match — check your authenticator app and try again.");
      return;
    }
    setCode("");
    setStep("codes");
  }

  async function regenerate() {
    if (!window.confirm("Regenerate backup codes? The old ones stop working immediately.")) return;
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    setBusy(false);
    setPassword("");
    if (error) {
      setError(error.message || "Couldn't regenerate — check your password.");
      return;
    }
    setSetup({ totpURI: "", backupCodes: data.backupCodes });
    setStep("codes");
  }

  async function disable2fa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const cleaned = code.trim().replace(/\s+/g, "");
    const { error: codeError } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: cleaned })
      : await authClient.twoFactor.verifyTotp({ code: cleaned });
    if (codeError) {
      setBusy(false);
      setError("That code didn't work — check it and try again.");
      return;
    }
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    setPassword("");
    setCode("");
    if (error) {
      setError(error.message || "Couldn't disable — check your password.");
      return;
    }
    setEnabled(false);
    setStep("idle");
    setSetup(null);
    router.refresh();
  }

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-medium text-ink">Two-factor authentication</h2>
          <DocHint slug="security" />
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            enabled ? "bg-success/10 text-success" : "bg-surface-2 text-ink-subtle"
          }`}
        >
          {enabled ? "On" : "Off"}
        </span>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-ink-subtle">
        {enabled
          ? "Sign-in asks for a code from your authenticator app after your password. All other sessions were signed out when you enabled it."
          : "Add a second lock to your account: a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy…) at every sign-in. Your studio holds client photos and payment relationships — a password alone shouldn't be the whole door."}
      </p>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {!enabled && step === "idle" && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => setStep("password")}>
            Enable two-factor
          </Button>
        </div>
      )}

      {!enabled && step === "password" && (
        <form className="mt-4 flex flex-col gap-3" onSubmit={startEnable}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="twofa-password">Confirm your password to start</Label>
            <Input
              id="twofa-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setStep("idle"); setError(null); }}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !password}>
              {busy ? "Starting…" : "Continue"}
            </Button>
          </div>
        </form>
      )}

      {!enabled && step === "scan" && setup && (
        <div className="mt-4 flex flex-col gap-4 rounded-lg border border-hairline bg-background p-4">
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <div className="rounded-lg bg-white p-3">
              <QRCode value={setup.totpURI} size={148} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Scan with your authenticator app</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-subtle">
                Can&apos;t scan? Enter this secret manually:
              </p>
              <code className="mt-2 block break-all rounded border border-hairline px-2 py-1 font-mono text-xs text-ink">
                {secret}
              </code>
            </div>
          </div>
          <form className="flex flex-col gap-3 border-t border-hairline pt-4" onSubmit={verifySetupCode}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="twofa-setup-code">Enter the 6-digit code the app shows</Label>
              <Input
                id="twofa-setup-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="max-w-48 text-center tracking-[0.3em]"
                autoFocus
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep("idle");
                  setSetup(null);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || code.trim().length < 6}>
                {busy ? "Verifying…" : "Verify and turn on"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {step === "codes" && setup && setup.backupCodes.length > 0 && (
        <BackupCodesView
          codes={setup.backupCodes}
          doneLabel="I've saved them"
          onDone={() => {
            setStep("idle");
            setSetup(null);
            setEnabled(true);
            router.refresh();
          }}
        />
      )}

      {enabled && step === "idle" && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={regenerate} disabled={busy}>
            Regenerate backup codes
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setStep("password")}>
            Disable…
          </Button>
        </div>
      )}

      {enabled && step === "password" && (
        <form className="mt-4 flex flex-col gap-3 rounded-lg border border-hairline bg-background p-4" onSubmit={disable2fa}>
          <p className="text-sm font-medium text-ink">Turn off two-factor</p>
          <p className="text-xs text-ink-subtle">Requires a valid code and your password.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="twofa-off-code">{useBackup ? "Backup code" : "Authenticator code"}</Label>
              <Input
                id="twofa-off-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={useBackup ? "xxxxxxxxxx" : "123456"}
                autoFocus
                required
              />
              <button
                type="button"
                className="self-start text-xs text-ink-subtle hover:text-ink"
                onClick={() => {
                  setUseBackup((v) => !v);
                  setCode("");
                }}
              >
                {useBackup ? "Use an authenticator code" : "Use a backup code"}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="twofa-off-password">Password</Label>
              <Input id="twofa-off-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setStep("idle"); setError(null); setCode(""); setPassword(""); }}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" size="sm" disabled={busy || !password || code.trim().length < 6}>
              {busy ? "Turning off…" : "Turn off 2FA"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
