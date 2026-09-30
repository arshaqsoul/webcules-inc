"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

import { SnapMark } from "@/components/snap-mark";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token: token!,
    });
    setPending(false);
    if (error) {
      setError(error.message || "Reset failed — request a new link and try again.");
      return;
    }
    // The reset revoked every session — a fresh sign-in starts the next one.
    setDone(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <SnapMark className="h-6 w-6" />
          <span className="text-sm font-medium text-ink">Snap</span>
        </div>
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-6">
          {done ? (
            <>
              <h1 className="text-lg font-semibold text-ink">Password updated</h1>
              <p className="mt-1 text-sm text-ink-subtle">
                Your new password is active and all other sessions were signed out.
              </p>
              <Button className="mt-6 w-full" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
            </>
          ) : !token ? (
            <>
              <h1 className="text-lg font-semibold text-ink">This link has expired</h1>
              <p className="mt-1 text-sm text-ink-subtle">
                Reset links expire after 60 minutes and only work once. Request a new one to
                continue.
              </p>
              <Button className="mt-6 w-full" asChild>
                <Link href="/forgot-password">Request a new link</Link>
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-ink">Choose a new password</h1>
              <p className="mt-1 text-sm text-ink-subtle">
                Signing you out everywhere and setting a fresh password.
              </p>
              <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? "Updating…" : "Update password"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
