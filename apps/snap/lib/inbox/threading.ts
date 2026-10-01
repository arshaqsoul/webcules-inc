/* WEB-307 — pure threading primitives for the inbound email pipeline and
 * outbound header emission. No I/O; everything here is unit-tested against
 * the threading corpus (In-Reply-To chains, stripped-header replies,
 * Outlook Thread-Index, RFC 5256 subject fallback, DSN detection). */

/** Extract every <…@…> message-id token from an In-Reply-To/References value. */
export function parseMessageIds(headerValue: string | null | undefined): string[] {
  if (!headerValue) return [];
  const out: string[] = [];
  const re = /<[^<>\s]+>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(headerValue))) out.push(m[0]);
  return out;
}

/** RFC 5256-ish base subject: strip (possibly repeated, possibly localized)
 * reply/forward prefixes and tag blocks. Returns a lowercase normalization
 * for exact comparison. */
export function baseSubject(subject: string | null | undefined): string {
  if (!subject) return "";
  let s = subject.trim();
  for (;;) {
    const stripped = s
      .replace(/^(\s*(re|fw|fwd|aw|sv|antw|odp|antwort|rif|tr|vb)\s*(\[\d+\])?\s*:\s*)+/i, "")
      .replace(/^\[[^\]]{1,40}\]\s*/, "");
    if (stripped === s) return s.trim().toLowerCase();
    s = stripped;
  }
}

/* ---------------- Thread-Index (MS-OXOMSG / MS-TNEF) ----------------
 * 22 bytes: bytes 0..5 carry a clock Outlook may shift between messages;
 * bytes 6..21 are a stable per-conversation GUID. We emit one per thread,
 * store it, and match INBOUND indexes on the GUID half. */

const GUID_OFFSET = 6;
const GUID_LEN = 16;

function clockBytes(): Uint8Array {
  // FILETIME-ish ms since 1601, 6 big-endian bytes — 48 bits fits a double.
  const clock = Date.now() + 11644473600000;
  const bytes = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    bytes[i] = Math.floor(clock / 2 ** (8 * (5 - i))) % 256;
  }
  return bytes;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** Mint the base64 Thread-Index for a conversation + the hex GUID half to
 * store alongside for prefix-free matching. */
export function mintThreadIndex(): { base64: string; guidHex: string } {
  const bytes = new Uint8Array(22);
  bytes.set(clockBytes(), 0);
  bytes.set(randomBytes(GUID_LEN), GUID_OFFSET);
  return { base64: toB64(bytes), guidHex: toHex(bytes.slice(GUID_OFFSET, GUID_OFFSET + GUID_LEN)) };
}

/** Stable GUID half of an inbound Thread-Index header, or null when the
 * header is absent/malformed (wrong length or not base64). */
export function threadIndexGuid(base64: string | null | undefined): string | null {
  if (!base64) return null;
  try {
    const bytes = fromB64(base64.trim());
    if (bytes.length < GUID_OFFSET + GUID_LEN) return null;
    return toHex(bytes.slice(GUID_OFFSET, GUID_OFFSET + GUID_LEN));
  } catch {
    return null;
  }
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The Thread-Index value we emit for a stored thread (clock bytes refreshed
 * per send, GUID preserved) — Outlook groups on it. */
export function refreshThreadIndexBase64(guidHex: string): string {
  const bytes = new Uint8Array(22);
  bytes.set(clockBytes(), 0);
  bytes.set(fromHex(guidHex), GUID_OFFSET);
  return toB64(bytes);
}

/* ---------------- Inbound address routing ---------------- */

export type InboundAddress =
  | { kind: "thread"; threadId: string; token: string }
  | { kind: "lead"; leadId: string }
  | { kind: "slug"; slug: string };

/** Parse the recipients for our routing local-parts (the To/Cc headers as
 * delivered): t-{threadId}-{token}@, hello+{leadId}@ and hello+{slug}@ on
 * snap.webcules.com. First match wins; display names tolerated. */
export function parseInboundAddress(toHeader: string | null | undefined): InboundAddress | null {
  if (!toHeader) return null;
  const addrs = toHeader.match(/[^\s<>,]+@snap\.webcules\.com/gi) ?? [];
  for (const raw of addrs) {
    const local = raw.split("@")[0].toLowerCase();
    const t = local.match(/^t-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([a-z0-9]{6,12})$/);
    if (t) return { kind: "thread", threadId: t[1], token: t[2] };
    const l = local.match(/^hello\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
    if (l) return { kind: "lead", leadId: l[1] };
    const s = local.match(/^hello\+([a-z0-9][a-z0-9-]{1,60})$/);
    if (s) return { kind: "slug", slug: s[1] };
  }
  return null;
}

/** The per-thread reply address we send from (and clients reply to). */
export function threadAddress(threadId: string, token: string): string {
  return `t-${threadId}-${token}@snap.webcules.com`;
}

/** Short unguessable token for the thread address. */
export function mintAddressToken(): string {
  return [...randomBytes(6)].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
}

/* ---------------- Bounce (DSN) detection ---------------- */

/** A bounce is: an auto-submitted report from a mailer-daemon/postmaster
 * envelope, or a multipart/report delivery-status content type. */
export function looksLikeDsn(payload: {
  from?: string | null;
  subject?: string | null;
  autoSubmitted?: boolean | null;
  contentType?: string | null;
}): boolean {
  const from = (payload.from ?? "").toLowerCase();
  if (/^(mailer-daemon|postmaster|no-reply|bounce|bounces|mail-daemon)@/.test(from)) return true;
  if ((payload.contentType ?? "").toLowerCase().includes("multipart/report")) return true;
  if (payload.autoSubmitted && /undeliver|delivery status|failure notice|returned mail/i.test(payload.subject ?? "")) {
    return true;
  }
  return false;
}

/** Pull OUR outbound message-ids out of a DSN body (status part quotes them
 * in In-Reply-To/References or the failed-message headers). */
export function extractSnapMessageIds(body: string | null | undefined): string[] {
  if (!body) return [];
  return parseMessageIds(body).filter((id) => id.endsWith("@snap.webcules.com>"));
}

/** Detect auto-forwarded mail (Gmail's "forward a copy" recipe wraps the
 * original sender in X-Forwarded-For / sets Auto-Submitted). Returns the
 * unwrapped ORIGINAL sender when present, else null. */
export function unwrapForwardedSender(payload: {
  from?: string | null;
  xForwardedFor?: string | null;
  autoSubmitted?: boolean | null;
}): string | null {
  if (!payload.autoSubmitted || !payload.xForwardedFor) return null;
  const inner = payload.xForwardedFor.match(/[^\s<>,]+@[^\s<>,]+/);
  return inner ? inner[0] : null;
}
