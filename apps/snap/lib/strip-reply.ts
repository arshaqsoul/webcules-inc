/* Strip quoted reply history from inbound email bodies.
 *
 * Clients quote the entire conversation on every reply (Gmail "On … wrote:",
 * Outlook "From:/Sent:" blocks, "> " prefixes). Threads should store and show
 * only what the sender actually wrote. Heuristic line-scanner — errs toward
 * keeping content; anything unstripped just shows a bit more context.
 */
export function stripQuotedReply(text: string): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);

  // Gmail/desktop signature delimiter.
  const sigIdx = lines.findIndex((l) => l.trim() === "--" || l.trim() === "-- ");
  if (sigIdx > 0) lines.length = sigIdx;

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Gmail: "On Fri, Sep 25, 2026 at 10:43 PM <x@y> wrote:" — possibly split
    // across 2–3 lines ("On … <" / "x@y> wrote:" / "> quoted lines").
    if (/^on .{0,200} wrote:\s*$/i.test(trimmed)) break;
    if (/^on .{0,200}$/i.test(trimmed)) {
      const next1 = (lines[i + 1] ?? "").trim();
      const next2 = (lines[i + 2] ?? "").trim();
      if (/^<?.+@.+>?\s*wrote:\s*$/.test(next1) || /wrote:\s*$/.test(next1)) break;
      if (/^<?.+@.+$/.test(next1) && /wrote:\s*$/.test(next2)) break;
    }
    // Outlook: "From: x" / "Sent: ..." header block
    if (/^from:\s*.+@.+/i.test(trimmed) && /^sent:\s*.+/i.test((lines[i + 1] ?? "").trim())) break;
    // Unix/mail-client style: "On … wrote:" embedded with quotes below, or a
    // solid block of "> " quoted lines — stop at the first quoted line.
    if (/^>\s?/.test(line)) {
      // Only treat as history if it looks like a quote block (not a Markdown
      // blockquote someone intended) — require 2+ consecutive ">" lines or a
      // preceding "wrote:" hint.
      const next = (lines[i + 1] ?? "").trim();
      if (/^>\s?/.test(lines[i + 1] ?? "") || /^\|/.test(next) || /^--$/.test(next)) break;
    }
    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}$/g, "\n\n").trim();
}
