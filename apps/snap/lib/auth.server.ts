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
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { and, eq, ne } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "./db";
import * as schema from "./db-schema";
import { PUBLIC_HOST, emailAddress, trustedAppOrigins } from "@/lib/hosts";

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
    <p style="margin:16px 0 0;font-size:12px;color:${SNAP_BRAND.inkSubtle};">${PUBLIC_HOST}</p>
  </td></tr></table></body></html>`;
}

function resetPasswordEmailHtml(url: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${SNAP_BRAND.canvas};font-family:Inter,-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SNAP_BRAND.canvas};padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${SNAP_BRAND.surface};border:1px solid ${SNAP_BRAND.hairline};border-radius:12px;padding:40px 32px;">
      <tr><td style="padding-bottom:8px;"><span style="font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${SNAP_BRAND.lavender};">Snap</span></td></tr>
      <tr><td style="padding-bottom:24px;"><h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:${SNAP_BRAND.ink};">Reset your password</h1></td></tr>
      <tr><td style="font-size:15px;line-height:1.6;color:${SNAP_BRAND.inkSubtle};">
        <p style="margin:0 0 24px;">Click the button below to choose a new password for your Snap account. The link expires in 60 minutes and can only be used once.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="${url}" style="display:inline-block;background:${SNAP_BRAND.lavender};color:${SNAP_BRAND.ink};font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;padding:12px 24px;">Choose a new password</a>
        </td></tr></table>
        <p style="margin:24px 0 0;font-size:12px;line-height:1.5;word-break:break-all;">Or paste this link into your browser: ${url}</p>
      </td></tr>
      <tr><td style="padding-top:32px;border-top:1px solid ${SNAP_BRAND.hairline};"><p style="margin:0;font-size:12px;line-height:1.5;color:${SNAP_BRAND.inkSubtle};">If you didn&rsquo;t request this, you can safely ignore this email &mdash; your current password stays unchanged.</p></td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:${SNAP_BRAND.inkSubtle};">${PUBLIC_HOST}</p>
  </td></tr></table></body></html>`;
}

/* WEB-275: team invite email shell (same brand language as auth mails). */
const INVITE_HTML = `<!doctype html><html><body style="margin:0;padding:0;background:${SNAP_BRAND.canvas};font-family:Inter,-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SNAP_BRAND.canvas};padding:40px 16px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${SNAP_BRAND.surface};border:1px solid ${SNAP_BRAND.hairline};border-radius:12px;padding:40px 32px;">
    <tr><td style="padding-bottom:8px;"><span style="font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${SNAP_BRAND.lavender};">Snap</span></td></tr>
    <tr><td style="padding-bottom:24px;"><h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:${SNAP_BRAND.ink};">Join __ORG__</h1></td></tr>
    <tr><td style="font-size:15px;line-height:1.6;color:${SNAP_BRAND.inkSubtle};">
      <p style="margin:0 0 24px;">__INVITER__ invited you to work on <strong style="color:${SNAP_BRAND.ink};">__ORG__</strong> in Snap. Accept to see its projects, galleries, and calendar as part of the team.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="__URL__" style="display:inline-block;background:${SNAP_BRAND.lavender};color:${SNAP_BRAND.ink};font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;padding:12px 24px;">Accept invitation</a>
      </td></tr></table>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;word-break:break-all;">Or paste this link: __URL__</p>
    </td></tr>
    <tr><td style="padding-top:32px;border-top:1px solid ${SNAP_BRAND.hairline};"><p style="margin:0;font-size:12px;line-height:1.5;color:${SNAP_BRAND.inkSubtle};">The invitation expires in 7 days. If you didn&rsquo;t expect it, you can ignore this email.</p></td></tr>
  </table>
  <p style="margin:16px 0 0;font-size:12px;color:${SNAP_BRAND.inkSubtle};">${PUBLIC_HOST}</p>
</td></tr></table></body></html>`;

async function deliverResetLink(to: string, url: string): Promise<void> {
  if (!env.EMAIL) {
    console.log(
      `[auth:dev-delivery] EMAIL binding unavailable — printing instead.\n[auth:dev-delivery] to=${to}\n[auth:dev-delivery] reset=${url}`,
    );
    return;
  }
  await env.EMAIL.send({
    to,
    from: env.EMAIL_FROM || `Snap <${emailAddress("hello")}>`,
    subject: "Reset your Snap password",
    html: resetPasswordEmailHtml(url),
    text: `Reset your Snap password: ${url} — the link expires in 60 minutes and can only be used once.`,
  });
  try {
    const db = getDb();
    await db.insert(schema.emailLog).values({
      id: crypto.randomUUID(),
      toEmail: to,
      template: "reset",
      status: "sent",
    });
  } catch (err) {
    console.error("email_log insert failed:", String(err));
  }
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
    from: env.EMAIL_FROM || `Snap <${emailAddress("hello")}>`,
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

/** WEB-275: audit_log row for a team membership change (never throws —
 * bookkeeping must not break the membership action itself). */
async function auditTeam(
  organizationId: string,
  actorId: string,
  action: string,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    await getDb().insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      actorId,
      action,
      targetType: "organization",
      targetId: organizationId,
      meta: JSON.stringify(meta),
    });
  } catch (err) {
    console.error("team audit insert failed:", String(err));
  }
}

// No options annotation — plugin inference must flow into the Auth type.
async function createAuthInstance() {
  return betterAuth({
    appName: "Snap",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [...trustedAppOrigins(env.BETTER_AUTH_URL), "http://localhost:5173", "http://localhost:3000"],
    database: drizzleAdapter(getDb(), { provider: "sqlite" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Email verification lands with the auth-hardening story.
      requireEmailVerification: false,
      // WEB-287: staff password reset. Reset links ride the same EMAIL binding
      // as OTP codes; every active session is revoked on reset so a stolen
      // session can't outlive a recovered account.
      sendResetPassword: async ({ user, url }) => {
        await deliverResetLink(user.email, url);
      },
      revokeSessionsOnPasswordReset: true,
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
      // Local dev + e2e drive whole auth lifecycles from one localhost IP
      // within a minute — headroom there; production keeps the tight cap.
      max: env.BETTER_AUTH_URL?.includes("localhost") ? 500 : 30,
    },
    hooks: {
      // WEB-90 isolation guard: a studio's client must never be invited into
      // the organization — a member seat would expose every other client's
      // data to them. Clients reach Snap through the portal, not as members.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/organization/invite-member") return;
        const body = ctx.body as
          | { email?: string; organizationId?: string; role?: string }
          | undefined;
        const email = String(body?.email ?? "").trim().toLowerCase();
        const organizationId = String(body?.organizationId ?? "");
        if (!email || !organizationId) return;
        const hit = await getDb()
          .select({ id: schema.clients.id })
          .from(schema.clients)
          .where(and(eq(schema.clients.organizationId, organizationId), eq(schema.clients.email, email)))
          .limit(1);
        if (hit.length) {
          throw new APIError("FORBIDDEN", {
            message:
              "This email belongs to a studio client — clients access Snap through the client portal, not as team members.",
          });
        }
        // WEB-275: invites carry admin or member (owner is transferred, never
        // invited) and must fit the plan's seat count (members + pending).
        const role = String(body?.role ?? "member");
        if (role !== "admin" && role !== "member") {
          throw new APIError("BAD_REQUEST", { message: "Invite role must be admin or member." });
        }
        const db = getDb();
        const [members, pending, profileRow] = await Promise.all([
          db
            .select({ id: schema.member.id })
            .from(schema.member)
            .where(eq(schema.member.organizationId, organizationId)),
          db
            .select({ id: schema.invitation.id })
            .from(schema.invitation)
            .where(and(eq(schema.invitation.organizationId, organizationId), eq(schema.invitation.status, "pending"))),
          db
            .select({ plan: schema.studioProfiles.plan })
            .from(schema.studioProfiles)
            .where(eq(schema.studioProfiles.organizationId, organizationId))
            .limit(1),
        ]);
        const { planDef } = await import("./plans-data");
        const seats = planDef(profileRow[0]?.plan).maxTeamSeats;
        if (members.length + pending.length >= seats) {
          throw new APIError("FORBIDDEN", {
            message: `Team seats full — your plan includes ${seats} seat${seats === 1 ? "" : "s"}. Upgrade in Settings → Billing to invite more people.`,
          });
        }
      }),
      // WEB-279 2FA lifecycle: audit every enable/disable/backup-code event
      // and revoke all *other* sessions the moment 2FA is enabled — a
      // password-confirmed action is the right point to force re-login
      // elsewhere. Login-time verifications run without a session (temp 2FA
      // cookie), so only in-session burns are audit-logged here; the plugin
      // rate-limits the login path itself.
      after: createAuthMiddleware(async (ctx) => {
        if (!ctx.path.startsWith("/two-factor/")) return;
        const session = ctx.context.session;
        const returned = ctx.context.returned as Response | undefined;
        const ok = !returned || returned.status === 200;
        if (!ok || !session) return ctx.context.returned;
        const action =
          ctx.path === "/two-factor/enable"
            ? "2fa.enabled"
            : ctx.path === "/two-factor/disable"
              ? "2fa.disabled"
              : ctx.path === "/two-factor/generate-backup-codes"
                ? "2fa.backup_codes_regenerated"
                : ctx.path === "/two-factor/verify-backup-code"
                  ? "2fa.backup_code_used"
                  : null;
        if (!action) return ctx.context.returned;
        const db = getDb();
        if (ctx.path === "/two-factor/enable") {
          // Revoke every other session of this user (keep the enabling one).
          const now = new Date();
          await db
            .update(schema.session)
            .set({ expiresAt: now })
            .where(and(eq(schema.session.userId, session.user.id), ne(schema.session.id, session.session.id)));
        }
        await db.insert(schema.auditLog).values({
          id: crypto.randomUUID(),
          actorType: "user",
          actorId: session.user.id,
          action,
          targetType: "user",
          targetId: session.user.id,
          meta: JSON.stringify({ via: "auth-hook" }),
        });
        return ctx.context.returned;
      }),
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        organizationLimit: 5,
        // WEB-275: membership lifecycle audit trail — plugin-native hooks
        // (every invite/accept/remove/role change lands in audit_log).
        organizationHooks: {
          afterCreateInvitation: async ({ invitation, inviter, organization }) => {
            await auditTeam(organization.id, inviter.id, "team.invited", {
              email: invitation.email,
              role: invitation.role,
            });
          },
          afterAcceptInvitation: async ({ invitation, member, user, organization }) => {
            await auditTeam(organization.id, user.id, "team.invite_accepted", {
              email: invitation.email,
              role: member.role,
            });
          },
          afterRemoveMember: async ({ member, user, organization }) => {
            await auditTeam(organization.id, user.id, "team.member_removed", {
              memberUserId: member.userId,
            });
          },
          afterUpdateMemberRole: async ({ member, previousRole, user, organization }) => {
            await auditTeam(organization.id, user.id, "team.role_changed", {
              from: previousRole,
              to: member.role,
              memberUserId: member.userId,
            });
          },
        },
        // WEB-275 team invites — branded mail through the EMAIL binding; the
        // accept page handles both signed-in users and new-account signups.
        invitationExpiresIn: 60 * 60 * 24 * 7,
        sendInvitationEmail: async ({ email, organization, inviter, invitation }) => {
          const url = `${env.BETTER_AUTH_URL}/invite/${invitation.id}`;
          if (!env.EMAIL) {
            console.log(`[auth:dev-delivery] invite to=${email} url=${url}`);
            return;
          }
          await env.EMAIL.send({
            to: email,
            from: env.EMAIL_FROM || `Snap <${emailAddress("hello")}>`,
            subject: `${inviter.user.name} invited you to ${organization.name} on Snap`,
            html: INVITE_HTML.replace(/__URL__/g, url)
              .replace(/__ORG__/g, organization.name)
              .replace(/__INVITER__/g, inviter.user.name),
            text: `${inviter.user.name} invited you to join ${organization.name} on Snap. Accept within 7 days: ${url}`,
          }).catch((err: unknown) => console.error("invite email failed:", String(err)));
        },
      }),
      // WEB-279: TOTP + single-use backup codes for studio staff. Opt-in per
      // account; forced-2FA org policy is a later toggle. Trusted-device
      // skipping is deliberately NOT enabled — every sign-in requires a code.
      twoFactor({
        issuer: "Snap",
        backupCodeOptions: { amount: 10, length: 10 },
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
