"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

import { authClient, signUp } from "@/lib/auth-client";

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const { error: signUpError } = await signUp.email({
      name: String(form.get("name") ?? ""),
      email,
      password,
    });
    if (signUpError) {
      setPending(false);
      setError(signUpError.message || "Sign up failed.");
      return;
    }

    // Create the studio organization + profile, then activate it.
    const studioRes = await fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studioName: String(form.get("studioName") ?? ""),
        timezone: detectTimezone(),
        contactEmail: email,
      }),
    });
    if (!studioRes.ok) {
      setPending(false);
      setError("Account created, but studio setup failed — continue from onboarding.");
      router.push("/onboarding");
      return;
    }
    const studio = (await studioRes.json()) as { organizationId: string };
    await authClient.organization.setActive({ organizationId: studio.organizationId });
    setPending(false);
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2">
          <span aria-hidden className="inline-block h-4 w-4 rounded-[4px] bg-primary" />
          <span className="text-sm font-medium text-ink">Snap</span>
        </div>
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-6">
          <h1 className="text-lg font-semibold text-ink">Create your studio</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            Branded booking, galleries, and payments — under your brand.
          </p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <p className="text-xs text-ink-tertiary">At least 8 characters.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="studioName">Studio name</Label>
              <Input id="studioName" name="studioName" placeholder="e.g. Willow & Pine Photography" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Setting up…" : "Create studio"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-ink-subtle">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:text-lavender-hover">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
