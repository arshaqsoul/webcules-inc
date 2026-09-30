"use client";

/* WEB-275 invitation acceptance — the link target of the team invite email.
 * Signed-out visitors are pointed at sign-in/signup first (the invitation
 * survives; they return to this URL); signed-in visitors accept and land in
 * the studio with it set active. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@webcules/ui/components/button";

import { authClient, useSession } from "@/lib/auth-client";
import { SnapMark } from "@/components/snap-mark";

export default function AcceptInvitePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [state, setState] = useState<"waiting" | "working" | "done" | "error">("waiting");
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (isPending || !session || started.current) return;
    started.current = true;
    (async () => {
      setState("working");
      const invitationId = window.location.pathname.split("/").pop() ?? "";
      const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
      if (error || !data) {
        setState("error");
        setMessage(
          error?.code === "INVALID_INVITATION" || error?.code === "EXPIRED_INVITATION"
            ? "This invitation is no longer valid — it may have expired, been cancelled, or already been used. Ask the studio to send a fresh one."
            : error?.message || "Couldn't accept the invitation — try again.",
        );
        return;
      }
      const organizationId =
        (data as { organizationId?: string }).organizationId ??
        (data as { member?: { organizationId?: string } }).member?.organizationId;
      if (organizationId) {
        await authClient.organization.setActive({ organizationId }).catch(() => undefined);
      }
      setState("done");
      setTimeout(() => router.push("/dashboard"), 800);
    })();
  }, [isPending, session, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <SnapMark className="h-6 w-6" />
          <span className="text-sm font-medium text-ink">Snap</span>
        </div>
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-6">
          <h1 className="text-lg font-semibold text-ink">Studio invitation</h1>
          {isPending && <p className="mt-1 text-sm text-ink-subtle">Checking your session…</p>}
          {!isPending && !session && (
            <>
              <p className="mt-1 text-sm leading-relaxed text-ink-subtle">
                You&apos;ve been invited to join a studio on Snap. Sign in with the email the invite was sent
                to — or create your account — then come back to this link to accept.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <Button onClick={() => (window.location.href = "/login")} className="w-full">
                  Sign in
                </Button>
                <Button variant="outline" onClick={() => (window.location.href = "/signup")} className="w-full">
                  Create an account
                </Button>
              </div>
            </>
          )}
          {state === "working" && <p className="mt-1 text-sm text-ink-subtle">Accepting…</p>}
          {state === "done" && (
            <p className="mt-1 text-sm text-success">Accepted — opening your studio dashboard…</p>
          )}
          {state === "error" && (
            <>
              <p className="mt-2 text-sm leading-relaxed text-destructive">{message}</p>
              <Link href="/login" className="mt-4 inline-block text-sm text-primary hover:underline">
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
