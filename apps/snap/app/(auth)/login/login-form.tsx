"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

import { authClient, signIn } from "@/lib/auth-client";
import { SnapMark } from "@/components/snap-mark";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // WEB-279: accounts with 2FA enabled get a second step after the password.
  const [needs2fa, setNeeds2fa] = useState(false);
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const { data, error } = await signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (error) {
      setError(error.message || "Sign in failed — check your email and password.");
      return;
    }
    if (data && typeof data === "object" && "twoFactorRedirect" in data) {
      setNeeds2fa(true);
      return;
    }
    router.push("/dashboard");
  }

  async function onVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const cleaned = code.trim().replace(/\s+/g, "");
    const { error } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: cleaned })
      : await authClient.twoFactor.verifyTotp({ code: cleaned });
    setPending(false);
    if (error) {
      setError(
        useBackup
          ? "That backup code didn't work — check it and try again."
          : "That code didn't work — check your authenticator app and try again.",
      );
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <SnapMark className="h-6 w-6" />
          <span className="text-sm font-medium text-ink">Snap</span>
        </div>
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-6">
          {needs2fa ? (
            <>
              <h1 className="text-lg font-semibold text-ink">Two-factor code</h1>
              <p className="mt-1 text-sm text-ink-subtle">
                {useBackup
                  ? "Enter one of your single-use backup codes."
                  : "Enter the 6-digit code from your authenticator app."}
              </p>
              <form className="mt-6 flex flex-col gap-4" onSubmit={onVerifyCode}>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="code">{useBackup ? "Backup code" : "Authenticator code"}</Label>
                  <Input
                    id="code"
                    name="code"
                    inputMode={useBackup ? "text" : "numeric"}
                    autoComplete="one-time-code"
                    placeholder={useBackup ? "xxxxxxxxxx" : "123456"}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="text-center text-lg tracking-[0.3em]"
                    autoFocus
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={pending || code.trim().length < 6} className="w-full">
                  {pending ? "Verifying…" : "Verify and sign in"}
                </Button>
                <button
                  type="button"
                  className="text-center text-sm text-ink-subtle hover:text-ink"
                  onClick={() => {
                    setUseBackup((v) => !v);
                    setCode("");
                    setError(null);
                  }}
                >
                  {useBackup ? "Use an authenticator code instead" : "Use a backup code instead"}
                </button>
                <p className="text-center text-xs leading-relaxed text-ink-subtle">
                  Lost your device and out of backup codes?{" "}
                  <Link href="/docs/security" className="text-primary hover:underline">
                    Account recovery
                  </Link>
                </p>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-ink">Sign in to your studio</h1>
              <p className="mt-1 text-sm text-ink-subtle">Welcome back.</p>
              <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" required />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-sm text-primary hover:text-lavender-hover"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-sm text-ink-subtle">
          New here?{" "}
          <Link href="/signup" className="text-primary hover:text-lavender-hover">
            Create your studio
          </Link>
        </p>
      </div>
    </main>
  );
}
