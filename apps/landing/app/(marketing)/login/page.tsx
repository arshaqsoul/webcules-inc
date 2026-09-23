import type { Metadata } from "next";

import { LoginPanel } from "@/components/auth/login-panel";

export const metadata: Metadata = {
  title: "Sign in — Webcules",
  description:
    "Save your playground configs and pick up where you left off — on any device.",
};

type SearchParams = Record<string, string | string[] | undefined>;

/* Only same-origin relative paths — blocks open redirects. */
function sanitizeRedirect(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const redirectTo = sanitizeRedirect(params.redirect);

  return (
    <div className="dark mx-auto w-full max-w-md px-6 pb-28 pt-32">
      <LoginPanel redirectTo={redirectTo} />
    </div>
  );
}
