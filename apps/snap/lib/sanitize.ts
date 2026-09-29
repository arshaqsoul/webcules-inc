/* Strict HTML sanitizer for studio-authored rich text that is later rendered
 * to third parties (emails, contract previews, booking pages). Pure
 * function, worker-side, no dependencies: hand-rolled tag scanner with a
 * hard allowlist — anything not explicitly allowed is dropped, content of
 * script/style/iframe-like elements is removed entirely, and every attribute
 * except a[href] (https/mailto only) is stripped. Every story that renders
 * studio HTML must route through sanitizeRichText (aliased renderSafeHtml).
 *
 * Model: text nodes are entity-preserving-escaped; allowlisted tags are
 * rebuilt from scratch (never echoed back); opening/closing tags are stack-
 * balanced so an unclosed <strong> cannot bleed formatting into the page
 * shell that embeds the fragment. */
const ALLOWED_TAGS = new Set(["p", "br", "strong", "em", "u", "ul", "ol", "li", "h3", "h4", "blockquote", "a"]);
const VOID_TAGS = new Set(["br"]);
/** Elements whose *content* is dangerous or meaningless when re-homed — the
 * whole element is removed, children included. */
const DROP_CONTENT_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "title", "textarea", "noscript", "svg", "math", "template", "xmp", "noembed", "noframes",
]);
const ALLOWED_HREF = /^(https:\/\/|mailto:)[^\s"<>]+$/i;

/** Escape a text node. Existing entities (&amp; &#39; &#x27;) are preserved
 * so double-sanitizing a fragment is stable. */
function escapeText(s: string): string {
  return s
    .replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]{1,31});)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape an attribute value (quoted context). */
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type ParsedTag = {
  name: string;
  closing: boolean;
  /** Position just past the closing `>` of the tag. */
  end: number;
  href: string | null;
};

/** Read the tag starting at input[start] (`<`). Returns null when it is not
 * a well-formed tag (caller treats it as literal text). Quote-aware so a
 * quoted `>` cannot smuggle attributes. */
function readTag(input: string, start: number): ParsedTag | null {
  let i = start + 1;
  let closing = false;
  if (input[i] === "/") {
    closing = true;
    i++;
  }
  const nameStart = i;
  while (i < input.length && /[a-zA-Z0-9]/.test(input[i])) i++;
  const name = input.slice(nameStart, i).toLowerCase();
  if (!name) return null;
  // Attribute region — scan to the closing `>` respecting quotes.
  let quote: string | null = null;
  let attrEnd = -1;
  for (; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      attrEnd = i;
      break;
    }
  }
  if (attrEnd < 0) return null; // unterminated tag — treat as text
  const attrs = input.slice(nameStart + name.length + (closing ? 1 : 0), attrEnd);
  let href: string | null = null;
  if (!closing && name === "a") {
    const m = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
    if (m) href = (m[2] ?? m[3] ?? m[4] ?? "").trim();
  }
  return { name, closing, end: attrEnd + 1, href };
}

/** Skip an element whose content must be dropped: advance past `</name>`. */
function skipElement(input: string, name: string, from: number): number {
  const re = new RegExp(`</${name}\\s*>`, "i");
  const m = re.exec(input.slice(from));
  return m ? from + m.index + m[0].length : input.length;
}

/** Sanitize studio-authored rich text to a strict allowlist fragment. */
export function sanitizeRichText(input: string): string {
  if (!input) return "";
  let out = "";
  let i = 0;
  const stack: string[] = [];
  while (i < input.length) {
    const lt = input.indexOf("<", i);
    if (lt < 0) {
      out += escapeText(input.slice(i));
      break;
    }
    out += escapeText(input.slice(i, lt));
    // Comments, doctypes, CDATA and processing instructions are dropped.
    if (input.startsWith("<!--", lt)) {
      const close = input.indexOf("-->", lt + 4);
      i = close < 0 ? input.length : close + 3;
      continue;
    }
    if (input[lt + 1] === "!" || input[lt + 1] === "?") {
      const close = input.indexOf(">", lt + 1);
      i = close < 0 ? input.length : close + 1;
      continue;
    }
    const tag = readTag(input, lt);
    if (!tag) {
      // Not a real tag (e.g. "3 < 5" or a broken fragment): render it as the
      // literal text a browser would show, minus the angle bracket.
      out += "&lt;";
      i = lt + 1;
      continue;
    }
    i = tag.end;
    if (DROP_CONTENT_TAGS.has(tag.name)) {
      if (!tag.closing) i = skipElement(input, tag.name, i);
      continue;
    }
    if (!ALLOWED_TAGS.has(tag.name)) continue; // strip tag, keep inner text
    if (tag.closing) {
      const at = stack.lastIndexOf(tag.name);
      if (at >= 0) {
        // Close any unclosed inner elements on the way out.
        for (let k = stack.length - 1; k > at; k--) out += `</${stack[k]}>`;
        stack.length = at;
        out += `</${tag.name}>`;
      }
      continue; // stray closer with no opener → drop
    }
    if (tag.name === "a") {
      out += tag.href && ALLOWED_HREF.test(tag.href)
        ? `<a href="${escapeAttr(tag.href)}" target="_blank" rel="noopener noreferrer">`
        : "<a>"; // allowlisted anchor without a dangerous href stays balanceable
      stack.push("a");
      continue;
    }
    // Browser-like sibling auto-close for <li>/<p> keeps output well-formed
    // when the studio authored implicit siblings ("<li>one<li>two").
    if ((tag.name === "li" || tag.name === "p") && stack[stack.length - 1] === tag.name) {
      out += `</${tag.name}>`;
      stack.pop();
    }
    out += `<${tag.name}>`;
    if (!VOID_TAGS.has(tag.name)) stack.push(tag.name);
  }
  for (let k = stack.length - 1; k >= 0; k--) out += `</${stack[k]}>`;
  return out;
}

/** Designer-facing alias — every renderer of studio HTML calls this. */
export const renderSafeHtml = sanitizeRichText;
