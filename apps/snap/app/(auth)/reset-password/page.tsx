/* WEB-287 — step 2 of password recovery. The emailed link points at Better
 * Auth's server route (/api/auth/reset-password/:token?callbackURL=/reset-
 * password), which validates the token and redirects here with ?token=…
 * (or ?error=INVALID_TOKEN for a bad/expired one). */
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const valid = Boolean(token) && error !== "INVALID_TOKEN";
  return <ResetPasswordForm token={valid ? token! : null} />;
}
