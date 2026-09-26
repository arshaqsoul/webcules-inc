"use client";

/* For users who have an account but no studio yet (signup fallback path). */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

import { authClient } from "@/lib/auth-client";

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studioName: String(form.get("studioName") ?? ""),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      }),
    });
    if (!res.ok) {
      setPending(false);
      setError("Studio creation failed — try again.");
      return;
    }
    const studio = (await res.json()) as { organizationId: string };
    await authClient.organization.setActive({ organizationId: studio.organizationId });
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[12px] border border-hairline bg-surface-1 p-6">
        <h1 className="text-lg font-semibold text-ink">Name your studio</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          This becomes your workspace — leads, calendar, projects, and galleries.
        </p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="studioName">Studio name</Label>
            <Input id="studioName" name="studioName" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating…" : "Create studio"}
          </Button>
        </form>
      </div>
    </main>
  );
}
