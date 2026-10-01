/* Strip quoted reply history from inbound email bodies.
 *
 * Clients quote the entire conversation on every reply (Gmail "On … wrote:",
 * Outlook "From:/Sent:" blocks, "> " prefixes). Threads should store and show
 * only what the sender actually wrote. Heuristic line-scanner — errs toward
 * keeping content; anything unstripped just shows a bit more context.
 *
 * WEB-305: splitReplyForDisplay is the render-time twin — it returns BOTH
 * halves so the UI can collapse the quoted part behind a "show trimmed
 * content" toggle. Storage keeps the full body (never destructive); display
 * hides the noise; bottom-posters lose nothing.
 */
export function stripQuotedReply(text: string): string {
  const { visible } = splitReplyForDisplay(text);
  return visible;
}

/** Find the line index where quoted history begins, or -1 when none. */
function quotedCutIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Gmail/desktop signature delimiter.
    if (trimmed === "--" || trimmed === "-- ") return i;

    // Gmail: "On Fri, Sep 25, 2026 at 10:43 PM <x@y> wrote:" — possibly split
    // across 2–3 lines ("On … <" / "x@y> wrote:" / "> quoted lines").
    if (/^on .{0,200} wrote:\s*$/i.test(trimmed)) return i;
    if (/^on .{0,200}$/i.test(trimmed)) {
      const next1 = (lines[i + 1] ?? "").trim();
      const next2 = (lines[i + 2] ?? "").trim();
      if (/^<?.+@.+>?\s*wrote:\s*$/.test(next1) || /wrote:\s*$/.test(next1)) return i;
      if (/^<?.+@.+$/.test(next1) && /wrote:\s*$/.test(next2)) return i;
    }
    // Outlook: "From: x" / "Sent: ..." header block
    if (/^from:\s*.+@.+/i.test(trimmed) && /^sent:\s*.+/i.test((lines[i + 1] ?? "").trim())) return i;
    // Unix/mail-client style: "On … wrote:" embedded with quotes below, or a
    // solid block of "> " quoted lines — stop at the first quoted line.
    if (/^>\s?/.test(line)) {
      // Only treat as history if it looks like a quote block (not a Markdown
      // blockquote someone intended) — require 2+ consecutive ">" lines or a
      // preceding "wrote:" hint.
      const next = (lines[i + 1] ?? "").trim();
      if (/^>\s?/.test(lines[i + 1] ?? "") || /^\|/.test(next) || /^--$/.test(next)) return i;
    }
  }
  return -1;
}

/** Render-time collapser: { visible, trimmed } — trimmed is null when the
 * message carries no detected quote/signature noise. */
export function splitReplyForDisplay(text: string): { visible: string; trimmed: string | null } {
  if (!text) return { visible: "", trimmed: null };
  const lines = text.split(/\r?\n/);
  const cut = quotedCutIndex(lines);
  if (cut <= 0) return { visible: text.trim(), trimmed: null };
  const visible = lines.slice(0, cut).join("\n").replace(/\n{3,}$/g, "\n\n").trim();
  const trimmed = lines.slice(cut).join("\n").replace(/\n{3,}$/g, "\n\n").trim();
  // Everything collapsed away → nothing worth a toggle.
  if (!visible && trimmed) return { visible: trimmed, trimmed: null };
  return { visible, trimmed: trimmed || null };
}
