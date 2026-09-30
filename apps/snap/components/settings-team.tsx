"use client";

/* Settings → Team (WEB-275) — member list, invites, role changes, and the
 * per-org "members see RAW vault" toggle. All membership writes ride Better
 * Auth's organization endpoints (owner/admin-gated, seat-gated, audited);
 * this component never touches the member tables directly. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

import { authClient } from "@/lib/auth-client";

export type TeamMemberView = {
  memberId: string;
  name: string;
  email: string;
  role: string;
  isYou: boolean;
};
export type TeamInviteView = { id: string; email: string; role: string; expiresAt: number };

const ROLE_COPY: Record<string, string> = {
  owner: "Owner — billing, payouts, everything",
  admin: "Admin — everything except billing",
  member: "Member — shoots, galleries, no settings or money",
};

export function SettingsTeam({
  members,
  invites,
  seatsUsed,
  seatsTotal,
  planName,
  myRole,
  memberRawAccess,
}: {
  members: TeamMemberView[];
  invites: TeamInviteView[];
  seatsUsed: number;
  seatsTotal: number;
  planName: string;
  myRole: string;
  memberRawAccess: boolean;
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rawAccess, setRawAccess] = useState(memberRawAccess);
  const isOwner = myRole === "owner";
  const seatsFull = seatsUsed >= seatsTotal;

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await authClient.organization.inviteMember({
      email: inviteEmail.trim(),
      role: inviteRole as "admin" | "member",
    });
    setBusy(false);
    if (error) {
      setError(error.message || "Couldn't send the invite — try again.");
      return;
    }
    setInviteEmail("");
    setNotice(`Invite sent to ${inviteEmail.trim() || "the address"} — it expires in 7 days.`);
    router.refresh();
  }

  async function cancelInvite(id: string, email: string) {
    if (!window.confirm(`Cancel the invite to ${email}?`)) return;
    setBusy(true);
    setError(null);
    await authClient.organization.cancelInvitation({ invitationId: id });
    setBusy(false);
    router.refresh();
  }

  async function changeRole(memberId: string, name: string, role: string) {
    const to = role === "member" ? "admin" : "member";
    if (!window.confirm(`Change ${name} to ${to === "admin" ? "Admin" : "Member"}?`)) return;
    setBusy(true);
    setError(null);
    const { error } = await authClient.organization.updateMemberRole({ memberId, role: to });
    setBusy(false);
    if (error) {
      setError(error.message || "Couldn't change the role — try again.");
      return;
    }
    router.refresh();
  }

  async function removeMember(memberId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this studio? They lose access immediately.`)) return;
    setBusy(true);
    setError(null);
    const { error } = await authClient.organization.removeMember({ memberIdOrEmail: memberId });
    setBusy(false);
    if (error) {
      setError(error.message || "Couldn't remove the member — try again.");
      return;
    }
    router.refresh();
  }

  async function saveRawAccess(v: boolean) {
    setRawAccess(v);
    const res = await fetch("/api/studio/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberRawAccess: v }),
    });
    if (!res.ok) {
      setRawAccess(!v);
      setError("Couldn't save the RAW vault toggle — try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium text-ink">Team</h2>
          <span className="text-xs text-ink-subtle">
            {seatsUsed} of {seatsTotal} seat{seatsTotal === 1 ? "" : "s"} · {planName} plan
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {members.map((m) => (
            <div
              key={m.memberId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-background px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">
                  {m.name}
                  {m.isYou && <span className="ml-1.5 text-xs text-ink-subtle">(you)</span>}
                </p>
                <p className="truncate text-xs text-ink-subtle">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs capitalize text-ink-subtle">
                  {m.role}
                </span>
                {isOwner && m.role !== "owner" && (
                  <>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => changeRole(m.memberId, m.name, m.role)}>
                      Make {m.role === "member" ? "admin" : "member"}
                    </Button>
                    <Button variant="destructive" size="sm" disabled={busy} onClick={() => removeMember(m.memberId, m.name)}>
                      Remove
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {isOwner && (
          <>
            <p className="mt-5 text-xs text-ink-subtle">{ROLE_COPY.owner}</p>
            <p className="mt-1 text-xs text-ink-subtle">{ROLE_COPY.admin}</p>
            <p className="mt-1 text-xs text-ink-subtle">{ROLE_COPY.member}</p>
          </>
        )}
      </section>

      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[15px] font-medium text-ink">Invite someone</h2>
        {seatsFull ? (
          <p className="mt-2 text-sm text-ink-subtle">
            All {seatsTotal} seat{seatsTotal === 1 ? " is" : "s are"} in use on the {planName} plan.{" "}
            {isOwner && "Upgrade in Settings → Billing to add more people."}
          </p>
        ) : (
          <form className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={invite}>
            <div className="min-w-0 flex-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="shooter@example.com"
                required
              />
            </div>
            <div className="w-full sm:w-40">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="snap-select w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="member">Member (second shooter)</option>
                <option value="admin">Admin (studio manager)</option>
              </select>
            </div>
            <Button type="submit" size="sm" disabled={busy || !inviteEmail.trim()}>
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </form>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {notice && <p className="mt-3 text-sm text-success">{notice}</p>}

        {invites.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Pending invites</p>
            {invites.map((i) => (
              <div
                key={i.id}
                data-invite-id={i.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-hairline bg-background px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{i.email}</p>
                  <p className="text-xs text-ink-subtle">
                    {i.role} · expires {new Date(i.expiresAt * 1000).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => cancelInvite(i.id, i.email)}>
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {isOwner && (
        <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <h2 className="text-[15px] font-medium text-ink">Member access</h2>
          <label className="mt-3 flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-hairline bg-background px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm text-ink">Members can open the RAW Vault</span>
              <span className="block text-xs text-ink-subtle">
                Off by default — second shooters work from approved galleries. Admins and you always have access.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={rawAccess}
              onChange={(e) => saveRawAccess(e.target.checked)}
              className="mt-0.5 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full border border-input bg-surface-2 transition-colors before:block before:h-4 before:w-4 before:translate-x-0 before:rounded-full before:bg-ink-subtle before:transition-transform checked:border-primary checked:bg-primary checked:before:translate-x-4 checked:before:bg-white"
            />
          </label>
        </section>
      )}
    </div>
  );
}
