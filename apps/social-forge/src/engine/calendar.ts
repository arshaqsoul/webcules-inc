import fs from "node:fs";
import path from "node:path";
import { projPath } from "./util.ts";
import { listPosts } from "./projects.ts";
import type { Post, ProjectManifest } from "./types.ts";

/** Posting schedule helpers — CSV + ICS export of approved/scheduled posts. */

export function schedulePosts(m: ProjectManifest): Post[] {
  const posts = listPosts(m.slug);
  const eligible = posts.filter((p) => p.scheduledFor && ["approved", "scheduled", "exported"].includes(p.status));
  return eligible.sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? -1 : 1));
}

function csvEsc(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildScheduleCsv(m: ProjectManifest): string {
  const rows = [
    ["post_id", "platform", "format", "status", "scheduled_for", "scheduled_slot_local", "hook", "cta_label", "cta_url", "asset_files"],
    ...schedulePosts(m).map((p) => [
      p.id,
      p.platform,
      p.format,
      p.status,
      p.scheduledFor!,
      p.scheduledFor!.replace("T", " ").slice(0, 16),
      p.hook.replace(/\n/g, " "),
      p.cta.label,
      p.cta.url ?? "",
      p.assets.map((a) => a.path.split("/").pop()).join(" | "),
    ]),
  ];
  return rows.map((r) => r.map(csvEsc).join(",")).join("\r\n") + "\r\n";
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildScheduleIcs(m: ProjectManifest): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//webcules//social-forge//EN", "CALSCALE:GREGORIAN"];
  for (const p of schedulePosts(m)) {
    const start = new Date(p.scheduledFor!);
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${p.id}-${m.slug}@social-forge`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEsc(`[${p.platform}] ${p.hook.slice(0, 60)}`)}`,
      `DESCRIPTION:${icsEsc(`${m.brand.business} — ${p.cta.label}. Assets: ${p.assets.map((a) => a.path.split("/").pop()).join(", ")}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Default cadence: stagger posts across platforms, 1–2/day on business hours. */
export function autoSchedule(m: ProjectManifest, startDate = new Date()): Post[] {
  const posts = listPosts(m.slug).filter((p) => p.status === "approved" && !p.scheduledFor);
  const ordered = ["instagram", "tiktok", "facebook", "linkedin", "whatsapp"];
  const updated: Post[] = [];
  let day = 0;
  let slot = 0;
  const times = ["09:30", "12:30", "17:30", "20:30"];
  for (const p of posts.sort((a, b) => ordered.indexOf(a.platform) - ordered.indexOf(b.platform))) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + day);
    d.setHours(...(times[slot % times.length]!.split(":").map(Number) as [number, number]), 0, 0);
    p.scheduledFor = d.toISOString();
    p.status = "scheduled";
    updated.push(p);
    slot++;
    if (slot % 3 === 0) day++;
  }
  return updated;
}

export function writeScheduleFiles(m: ProjectManifest): { csv: string; ics: string } {
  const csv = buildScheduleCsv(m);
  const ics = buildScheduleIcs(m);
  fs.writeFileSync(path.join(projPath(m.slug), "schedule.csv"), csv);
  fs.writeFileSync(path.join(projPath(m.slug), "schedule.ics"), ics);
  return { csv, ics };
}
