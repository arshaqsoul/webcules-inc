/* Triage helpers (WEB-335) - pure. */

export type TriageSender = { email: string; name: string | null };

/** The sender of an unmatched email, read from the triage item title
 * ("Unmatched email - Dana <dana@t.test>" or "... - dana@t.test"). Used to
 * pre-fill the "connect a client" prompt instead of inventing a recipient. */
export function senderFromTriageTitle(title: string | null | undefined): TriageSender | null {
  if (!title) return null;
  const tail = title.split(/\s[—–-]\s/).slice(1).join(" - ").trim();
  if (!tail) return null;
  const angled = /^(.*?)\s*<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>\s*$/.exec(tail);
  if (angled) {
    const name = angled[1].replace(/^["']|["']$/g, "").trim();
    return { email: angled[2].toLowerCase(), name: name || null };
  }
  const bare = /^([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)$/.exec(tail);
  return bare ? { email: bare[1].toLowerCase(), name: null } : null;
}
