/* Server-side Better Auth for the components playground (D1-backed).
 *
 * better-auth is instantiated PER REQUEST via getAuth() — never at module
 * scope — because the D1 binding and worker env only exist inside a request.
 * API routes: `const auth = await getAuth(); return auth.handler(req)`.
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { magicLink } from "better-auth/plugins/magic-link";
import { and, desc, eq } from "drizzle-orm";

import { getDb, getEnv, type AppEnv } from "./db";
import * as schema from "./db-schema";
import type { ConfigValues } from "./saved-configs";

/* ---------------- Email delivery (Resend REST) ---------------- */

const BRAND = {
  bg: "#0d0d17",
  card: "#15151f",
  border: "#26263a",
  text: "#ececf1",
  muted: "#8a8a9e",
  accent: "#8b5cf6",
};

const FONT_STACK =
  "'Geist', 'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${BRAND.bg};font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;padding:40px 32px;">
            <tr>
              <td style="padding-bottom:8px;">
                <span style="font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.accent};">Webcules</span>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:${BRAND.text};">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.6;color:${BRAND.muted};">${bodyHtml}</td>
            </tr>
            <tr>
              <td style="padding-top:32px;border-top:1px solid ${BRAND.border};">
                <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">If you didn&rsquo;t request this, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:${BRAND.muted};">webcules.com</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function magicLinkEmailHtml(url: string): string {
  return emailShell(
    "Sign in to Webcules",
    `<p style="margin:0 0 24px;">Click the button below to sign in. The link expires in 5 minutes.</p>
     <a href="${url}" style="display:inline-block;background:${BRAND.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">Sign in</a>
     <p style="margin:24px 0 0;">Or paste this URL into your browser:<br /><span style="color:${BRAND.text};word-break:break-all;">${url}</span></p>`,
  );
}

function otpEmailHtml(otp: string, purpose: string): string {
  return emailShell(
    "Your verification code",
    `<p style="margin:0 0 24px;">Use this code to continue (${purpose}). It expires in 5 minutes.</p>
     <div style="font-family:'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;font-size:36px;font-weight:600;letter-spacing:0.3em;color:${BRAND.text};background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:8px;padding:16px 12px;text-align:center;">${otp}</div>`,
  );
}

/**
 * Send via the Resend REST API. Callers short-circuit to console delivery when
 * RESEND_API_KEY is unset (local dev), so this only runs with a real key.
 */
async function sendEmail(env: AppEnv, to: string, subject: string, html: string): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("sendEmail called without RESEND_API_KEY");
  }

  const from = env.EMAIL_FROM || "Webcules <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend delivery failed (${res.status}): ${detail}`);
  }
}

async function sendMagicLinkEmail(env: AppEnv, to: string, url: string): Promise<void> {
  const subject = "Your Webcules sign-in link";
  if (!env.RESEND_API_KEY) {
    console.log(
      `[auth:dev-delivery] RESEND_API_KEY not set — printing email instead of sending.\n` +
        `[auth:dev-delivery] to=${to}\n` +
        `[auth:dev-delivery] subject=${subject}\n` +
        `[auth:dev-delivery] magic-link=${url}`,
    );
    return;
  }
  await sendEmail(env, to, subject, magicLinkEmailHtml(url));
}

async function sendOtpEmail(
  env: AppEnv,
  to: string,
  otp: string,
  type: "sign-in" | "email-verification" | "forget-password" | "change-email",
): Promise<void> {
  const subject = `Your Webcules verification code: ${otp}`;
  if (!env.RESEND_API_KEY) {
    console.log(
      `[auth:dev-delivery] RESEND_API_KEY not set — printing email instead of sending.\n` +
        `[auth:dev-delivery] to=${to}\n` +
        `[auth:dev-delivery] subject=Webcules verification code (${type})\n` +
        `[auth:dev-delivery] otp=${otp}`,
    );
    return;
  }
  await sendEmail(env, to, subject, otpEmailHtml(otp, type));
}

/* ---------------- Better Auth instance ---------------- */

const DEV_FALLBACK_SECRET = "dev-insecure-secret-change-me";

export async function getAuth() {
  const [db, env] = await Promise.all([getDb(), getEnv()]);

  let secret = env.BETTER_AUTH_SECRET;
  if (!secret) {
    console.warn(
      "[auth] BETTER_AUTH_SECRET is not set — falling back to an insecure dev secret. " +
        "Set it with `wrangler secret put BETTER_AUTH_SECRET` before deploying.",
    );
    secret = DEV_FALLBACK_SECRET;
  }

  const socialProviders: BetterAuthOptions["socialProviders"] = {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  };

  return betterAuth({
    appName: "Webcules",
    secret,
    baseURL: env.BETTER_AUTH_URL || "http://localhost:3000",
    trustedOrigins: [
      "http://localhost:3000",
      "https://webcules.com",
      "https://www.webcules.com",
    ],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    socialProviders,
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh once a day
    },
    rateLimit: {
      enabled: true,
      window: 60, // seconds
      max: 10,
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail(env, email, url);
        },
      }),
      emailOTP({
        otpLength: 6,
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendOtpEmail(env, email, otp, type);
        },
      }),
    ],
  });
}

/* ---------------- Saved configs helpers ---------------- */

export type SavedConfigRecord = {
  id: string;
  component: string;
  title: string;
  config: ConfigValues;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

function toIso(value: Date | null | undefined): string {
  return (value ?? new Date()).toISOString();
}

function parseConfig(json: string): ConfigValues {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ConfigValues;
    }
  } catch {
    /* corrupted row — fall through */
  }
  return {};
}

function toRecord(row: {
  id: string;
  component: string;
  title: string;
  config: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}): SavedConfigRecord {
  return {
    id: row.id,
    component: row.component,
    title: row.title,
    config: parseConfig(row.config),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** One saved config, ownership-checked. Returns null when missing or foreign. */
export async function getSavedConfigForUser(
  id: string,
  userId: string,
): Promise<SavedConfigRecord | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.savedConfigs)
    .where(and(eq(schema.savedConfigs.id, id), eq(schema.savedConfigs.userId, userId)))
    .limit(1);
  const row = rows[0];
  return row ? toRecord(row) : null;
}

/** All saved configs for a user, newest updated first. */
export async function listSavedConfigsForUser(userId: string): Promise<SavedConfigRecord[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.savedConfigs)
    .where(eq(schema.savedConfigs.userId, userId))
    .orderBy(desc(schema.savedConfigs.updatedAt));
  return rows.map(toRecord);
}
