/* Server-side Better Auth for Snap (D1-backed).
 *
 * The auth instance is a lazy per-isolate singleton: `cloudflare:workers` env
 * is importable at module scope, but the instance is only constructed inside
 * getAuth() so build-time module evaluation never touches bindings.
 *
 * Identity model (see Security doc):
 *  - studio staff: email + password, members of an organization (owner/admin/member)
 *  - clients: passwordless via emailOTP (6-digit code through the EMAIL binding)
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization } from "better-auth/plugins/organization";
import { env } from "cloudflare:workers";

import { getDb } from "./db";
import * as schema from "./db-schema";

const SNAP_BRAND = {
  canvas: "#010102",
  surface: "#0f1011",
  hairline: "#23252a",
  ink: "#f7f8f8",
  inkSubtle: "#8a8f98",
  lavender: "#5e6ad2",
};

function otpEmailHtml(code: string, purpose: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${SNAP_BRAND.canvas};font-family:Inter,-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SNAP_BRAND.canvas};padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${SNAP_BRAND.surface};border:1px solid ${SNAP_BRAND.hairline};border-radius:12px;padding:40px 32px;">
      <tr><td style="padding-bottom:8px;"><span style="font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${SNAP_BRAND.lavender};">Snap</span></td></tr>
      <tr><td style="padding-bottom:24px;"><h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:${SNAP_BRAND.ink};">Your verification code</h1></td></tr>
      <tr><td style="font-size:15px;line-height:1.6;color:${SNAP_BRAND.inkSubtle};">
        <p style="margin:0 0 24px;">Use this code to continue (${purpose}). It expires in 10 minutes.</p>
        <div style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:36px;font-weight:600;letter-spacing:0.3em;color:${SNAP_BRAND.ink};background:${SNAP_BRAND.canvas};border:1px solid ${SNAP_BRAND.hairline};border-radius:8px;padding:16px 12px;text-align:center;">${code}</div>
      </td></tr>
      <tr><td style="padding-top:32px;border-top:1px solid ${SNAP_BRAND.hairline};"><p style="margin:0;font-size:12px;line-height:1.5;color:${SNAP_BRAND.inkSubtle};">If you didn&rsquo;t request this, you can safely ignore this email.</p></td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:${SNAP_BRAND.inkSubtle};">snap.webcules.com</p>
  </td></tr></table></body></html>`;
}

async function deliverOtp(to: string, code: string, purpose: string): Promise<void> {
  if (!env.EMAIL) {
    console.log(
      `[auth:dev-delivery] EMAIL binding unavailable — printing instead.\n[auth:dev-delivery] to=${to}\n[auth:dev-delivery] code=${code} (${purpose})`,
    );
    return;
  }
  await env.EMAIL.send({
    to,
    from: env.EMAIL_FROM || "Snap <hello@snap.webcules.com>",
    subject: "Your Snap verification code",
    html: otpEmailHtml(code, purpose),
    text: `Your Snap verification code is ${code}. It expires in 10 minutes. (${purpose})`,
  });
  try {
    const db = getDb();
    await db.insert(schema.emailLog).values({
      id: crypto.randomUUID(),
      toEmail: to,
      template: "otp",
      status: "sent",
    });
  } catch (err) {
    console.error("email_log insert failed:", String(err));
  }
}

// No options annotation — plugin inference must flow into the Auth type.
async function createAuthInstance() {
  return betterAuth({
    appName: "Snap",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL, "http://localhost:5173", "http://localhost:3000"].filter(
      Boolean,
    ) as string[],
    database: drizzleAdapter(getDb(), { provider: "sqlite" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Email verification lands with the auth-hardening story.
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh daily
    },
    rateLimit: {
      enabled: true,
      // Workers are multi-isolate: database storage makes limits global, not per-isolate.
      storage: "database",
      window: 60,
      max: 30,
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        organizationLimit: 5,
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        sendVerificationOTP: async ({ email, otp, type }) => {
          await deliverOtp(email, otp, type === "sign-in" ? "signing in" : "verification");
        },
      }),
    ],
  });
}

export type Auth = Awaited<ReturnType<typeof createAuthInstance>>;

let authPromise: Promise<Auth> | null = null;

/** Lazy per-isolate auth instance. Call inside request contexts. */
export function getAuth(): Promise<Auth> {
  authPromise ??= createAuthInstance();
  return authPromise;
}
