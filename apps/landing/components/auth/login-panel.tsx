"use client";

/* Sign-in panel for the components playground: magic link or 6-digit
 * passcode (better-auth magic-link + email-otp plugins), plus Google when
 * the server exposes it. On an existing session it completes any save parked
 * while signed out, then moves on to the redirect target. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import Logo from "@/components/shared/logo";
import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@webcules/ui/components/tabs";

import { useReplayPendingSave } from "@/components/auth/replay-pending-save";
import { authClient, signIn, useSession } from "@/lib/auth-client";

type LoginPanelProps = {
  /** Where to send the user after sign-in (sanitized server-side). */
  redirectTo?: string;
};

export function LoginPanel({ redirectTo }: LoginPanelProps) {
  const router = useRouter();
  const target = redirectTo || "/dashboard";
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session?.user);
  const [googleReady, setGoogleReady] = useState(false);

  useReplayPendingSave(!isPending && signedIn);

  /* Already authenticated (or just verified a passcode): finish any parked
   * save (hook above) and continue to where the user was headed. */
  useEffect(() => {
    if (!isPending && signedIn) router.replace(target);
  }, [isPending, signedIn, router, target]);

  /* Show the Google button only when the server actually offers it. */
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/providers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { providers?: { google?: boolean } }) => {
        if (alive && json?.providers?.google) setGoogleReady(true);
      })
      .catch(() => {
        /* provider discovery unavailable — simply no Google button */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (isPending || signedIn) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="mx-auto w-fit">
          <Logo />
        </div>
        <p className="mt-4 text-sm text-white/50">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
      <div className="mx-auto w-fit">
        <Logo />
      </div>
      <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight">
        Sign in to Webcules
      </h1>
      <p className="mt-2 text-center text-sm leading-relaxed text-white/60">
        Save your playground configs and pick up where you left off — on any
        device.
      </p>

      <Tabs defaultValue="magic" className="mt-6">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="magic" className="flex-1">
            Magic link
          </TabsTrigger>
          <TabsTrigger value="passcode" className="flex-1">
            Passcode
          </TabsTrigger>
        </TabsList>
        <TabsContent value="magic">
          <MagicLinkForm target={target} />
        </TabsContent>
        <TabsContent value="passcode">
          <PasscodeForm target={target} />
        </TabsContent>
      </Tabs>

      {googleReady ? (
        <>
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-xs font-medium uppercase tracking-widest text-white/35">
              or
            </span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <Button
            variant="outline"
            className="w-full border-white/15 bg-white/[0.06] text-white hover:bg-white/10 hover:text-white"
            onClick={() => {
              void signIn.social({ provider: "google", callbackURL: target });
            }}
          >
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>
        </>
      ) : null}

      <p className="mt-8 text-center text-xs text-white/40">
        We only use your email for sign-in. No passwords, no spam.{" "}
        <Link
          href="/components"
          className="text-white/50 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          Back to components
        </Link>
      </p>
    </div>
  );
}

/** Magic link: one email with a sign-in URL (5-minute expiry server-side). */
function MagicLinkForm({ target }: { target: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-medium">Check your inbox</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          We sent a sign-in link to <span className="text-white">{email}</span>.
          It expires in 5 minutes.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-4 text-white/50 hover:text-white"
          onClick={() => {
            setSent(false);
            setError(null);
          }}
        >
          Use a different email
        </Button>
      </div>
    );
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await signIn.magicLink({ email, callbackURL: target });
    setBusy(false);
    if (err) {
      setError("Could not send the link — double-check your email and try again.");
      return;
    }
    setSent(true);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="magic-email" className="text-white/60">
          Email
        </Label>
        <Input
          id="magic-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
        />
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <Button
        type="submit"
        disabled={busy || !email}
        className="w-full bg-violet-500 text-white hover:bg-violet-400"
      >
        {busy ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}

/** Passcode: 6-digit one-time code emailed, then verified in place. */
function PasscodeForm({ target }: { target: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setBusy(false);
    if (err) {
      setError("Could not send the code — double-check your email and try again.");
      return;
    }
    setStage("code");
  };

  const verify = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (otp.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await signIn.emailOtp({ email, otp });
    setBusy(false);
    if (err) {
      setError("Invalid or expired code. Request a new one and try again.");
      return;
    }
    /* Session is live: the panel-level effect completes any parked save and
     * redirects via the session update — replace() here just makes it snappy. */
    router.replace(target);
  };

  return stage === "email" ? (
    <form onSubmit={sendCode} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="otp-email" className="text-white/60">
          Email
        </Label>
        <Input
          id="otp-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
        />
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <Button
        type="submit"
        disabled={busy || !email}
        className="w-full bg-violet-500 text-white hover:bg-violet-400"
      >
        {busy ? "Sending…" : "Email me a 6-digit code"}
      </Button>
    </form>
  ) : (
    <form onSubmit={verify} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="otp-code" className="text-white/60">
          6-digit code sent to {email}
        </Label>
        <Input
          id="otp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="••••••"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="border-white/10 bg-white/[0.04] text-center font-mono text-lg tracking-[0.6em] text-white placeholder:text-white/25"
        />
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <Button
        type="submit"
        disabled={busy || otp.length !== 6}
        className="w-full bg-violet-500 text-white hover:bg-violet-400"
      >
        {busy ? "Verifying…" : "Verify & sign in"}
      </Button>
      <button
        type="button"
        className="block w-full text-center text-xs text-white/40 underline-offset-4 transition-colors hover:text-white hover:underline"
        onClick={() => {
          setStage("email");
          setOtp("");
          setError(null);
        }}
      >
        Use a different email
      </button>
    </form>
  );
}
