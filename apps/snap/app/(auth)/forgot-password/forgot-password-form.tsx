"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

import { SnapMark } from "@/components/snap-mark";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.requestPasswordReset({
      email: String(form.get("email") ?? ""),
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (error) {
      setError(error.message || "Something went wrong — please try again.");
      return;
    }
    // The server answers identically whether or not the account exists;
    // this screen does too, so it never leaks account presence.
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <SnapMark className="h-6 w-6" />
          <span className="text-sm font-medium text-ink">Snap</span>
        </div>
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-6">
          {sent ? (
            <>
              <h1 className="text-lg font-semibold text-ink">Check your email</h1>
              <p className="mt-1 text-sm text-ink-subtle">
                If an account exists for that address, a reset link is on its way. The link expires
                in 60 minutes.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-ink">Reset your password</h1>
              <p className="mt-1 text-sm text-ink-subtle">
                Enter your email and we&rsquo;ll send you a link to choose a new password.
              </p>
              <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" required />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-sm text-ink-subtle">
          Remembered it?{" "}
          <Link href="/login" className="text-primary hover:text-lavender-hover">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
