/* Email display sanitizer (WEB-305) — the server-side allowlist pass under
 * the sandboxed-iframe render (defense in depth; the iframe is the primary
 * wall). Email HTML needs a far richer vocabulary than studio rich text
 * (tables, fonts, inline styles), so this is a dedicated pass — not
 * sanitizeRichText — with a per-tag attribute allowlist:
 *   - script/iframe/object/embed/form/input/button/select/link/meta/svg/…
 *     dropped with their content
 *   - every on* handler dropped by construction (only allowlisted attrs are
 *     ever re-emitted, rebuilt from scratch — nothing is echoed back)
 *   - href limited to http(s)/mailto; javascript:/vbscript:/data: killed
 *   - inline style kept (inert without scripts) minus url(...)/expression()
 *     so CSS can't track or fetch
 *   - remote images rewritten src → data-src (click-to-load in the frame);
 *     small data:image/* kept; cid: references dropped
 * Pure function, worker-side, no dependencies. */
const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "div", "span", "center",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "strong", "b", "em", "i", "u", "s", "strike", "small", "big", "sub", "sup", "mark",
  "ul", "ol", "li", "dl", "dt", "dd", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "img", "a", "font",
]);
const VOID_TAGS = new Set(["br", "hr", "img", "col"]);

/** Elements whose whole subtree is dangerous or meaningless re-homed. */
const DROP_CONTENT_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "form", "input", "button",
  "select", "option", "textarea", "link", "meta", "title", "head", "base",
  "noscript", "svg", "math", "template", "xmp", "noembed", "noframes",
  "frame", "frameset", "applet", "audio", "video", "source", "track",
]);

const ALLOWED_HREF = /^(https?:\/\/|mailto:)[^\s"<>]+$/i;
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i;

/** Attributes kept per tag (lowercase). */
const ATTR_ALLOWLIST: Record<string, Set<string>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt", "width", "height", "border"]),
  font: new Set(["color", "size", "face"]),
  td: new Set(["colspan", "rowspan", "align", "valign", "width", "height", "bgcolor"]),
  th: new Set(["colspan", "rowspan", "align", "valign", "width", "height", "bgcolor"]),
  table: new Set(["align", "width", "border", "cellpadding", "cellspacing", "bgcolor"]),
  col: new Set(["span", "width"]),
  colgroup: new Set(["span", "width"]),
};
/** Attributes allowed on ANY allowlisted tag. */
const GLOBAL_ATTRS = new Set(["style", "align", "valign", "width", "height", "dir", "lang"]);

function escapeText(s: string): string {
  return s
    .replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]{1,31});)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Strip fetch/tracking vectors from an inline style value; keep colors,
 * layout and fonts. url(...), expression(), behavior: and position:fixed
 * (overlay spoofing inside the frame) die. */
function sanitizeStyle(v: string): string {
  return v
    .replace(/url\s*\([^)]*\)/gi, "")
    .replace(/expression\s*\(/gi, "(")
    .replace(/behavior\s*:[^;}]*/gi, "")
    .replace(/(-moz-binding|position)\s*:\s*fixed/gi, "$1:static")
    .trim();
}

type ParsedTag = {
  name: string;
  closing: boolean;
  end: number;
  attrs: Array<{ name: string; value: string }>;
};

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
  if (attrEnd < 0) return null;
  const raw = input.slice(nameStart + name.length + (closing ? 1 : 0), attrEnd);
  const attrs: Array<{ name: string; value: string }> = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs.push({ name: m[1].toLowerCase(), value: (m[3] ?? m[4] ?? m[5] ?? "").trim() });
  }
  return { name, closing, end: attrEnd + 1, attrs };
}

function skipElement(input: string, name: string, from: number): number {
  const re = new RegExp(`</${name}\\s*>`, "i");
  const m = re.exec(input.slice(from));
  return m ? from + m.index + m[0].length : input.length;
}

export type SanitizedEmail = {
  /** Allowlisted fragment, safe to embed in a sandboxed srcdoc. */
  html: string;
  /** Count of remote images found (rewritten to data-src, click-to-load). */
  remoteImages: number;
};
export function sanitizeEmailHtml(input: string): SanitizedEmail {
  if (!input) return { html: "", remoteImages: 0 };
  let out = "";
  let remoteImages = 0;
  let i = 0;
  const stack: string[] = [];

  const attrStr = (tag: ParsedTag): string => {
    const allowed = ATTR_ALLOWLIST[tag.name];
    let s = "";
    for (const a of tag.attrs) {
      if (a.name.startsWith("on")) continue; // by construction, but explicit
      if (!(GLOBAL_ATTRS.has(a.name) || allowed?.has(a.name))) continue;
      if (a.name === "style") {
        const v = sanitizeStyle(a.value);
        if (v) s += ` style="${escapeAttr(v)}"`;
        continue;
      }
      if (tag.name === "a" && a.name === "href") {
        if (ALLOWED_HREF.test(a.value)) s += ` href="${escapeAttr(a.value)}"`;
        continue;
      }
      if (tag.name === "img" && a.name === "src") {
        if (/^https?:\/\//i.test(a.value)) {
          // Remote image: withhold until click-to-load re-renders the frame.
          remoteImages++;
          s += ` data-src="${escapeAttr(a.value)}"`;
        } else if (SAFE_DATA_IMAGE.test(a.value)) {
          s += ` src="${escapeAttr(a.value)}"`;
        } // cid:/anything else: dropped (client shows alt text)
        continue;
      }
      s += ` ${a.name}="${escapeAttr(a.value)}"`;
    }
    if (tag.name === "a" && s.includes("href=")) s += ' target="_blank" rel="noopener noreferrer"';
    return s;
  };

  while (i < input.length) {
    const lt = input.indexOf("<", i);
    if (lt < 0) {
      out += escapeText(input.slice(i));
      break;
    }
    out += escapeText(input.slice(i, lt));
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
        for (let k = stack.length - 1; k > at; k--) out += `</${stack[k]}>`;
        stack.length = at;
        out += `</${tag.name}>`;
      }
      continue;
    }
    // Browser-like sibling auto-close keeps implicit-sibling email HTML
    // well-formed ("<li>one<li>two") — close the open sibling BEFORE the new
    // opener is emitted.
    if ((tag.name === "li" || tag.name === "p" || tag.name === "tr" || tag.name === "td") && stack[stack.length - 1] === tag.name) {
      out += `</${tag.name}>`;
      stack.pop();
    }
    if (tag.name === "a") {
      out += `<a${attrStr(tag)}>`; // anchor without href stays balanceable
    } else {
      out += `<${tag.name}${attrStr(tag)}>`;
    }
    if (!VOID_TAGS.has(tag.name)) stack.push(tag.name);
  }
  for (let k = stack.length - 1; k >= 0; k--) out += `</${stack[k]}>`;
  return { html: out, remoteImages };
}

/** WEB-307 — store-time tracking-pixel neutralization: drop 1×1 (or 0×0)
 * remote images entirely from the HTML we persist. Operates on
 * sanitizeEmailHtml OUTPUT, so <img> tags are exactly the ones we rebuilt
 * (src / data-src / width / height / style attributes only). Pairs with the
 * render-time click-to-load wall; this keeps pixels out of storage (and out
 * of any future re-render) for good. */
export function neutralizeTrackingPixels(html: string): { html: string; removed: number } {
  let removed = 0;
  const out = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const attrVal = (attr: string): string | null => {
      const m = new RegExp(`(?:^|\\s)${attr}\\s*=\\s*"([^"]*)"`).exec(tag);
      return m ? m[1].trim() : null;
    };
    // The px-suffix strip is for width/height ATTRIBUTES ("600px"); applying
    // it to the style VALUE would truncate "height:1px" at the tail.
    const dim = (attr: string): string | null => attrVal(attr)?.replace(/px$/i, "") ?? null;
    const w = dim("width");
    const h = dim("height");
    const style = attrVal("style") ?? "";
    const sw = /(?:^|;)\s*width\s*:\s*([0-9.]+)\s*px/i.exec(style)?.[1];
    const sh = /(?:^|;)\s*height\s*:\s*([0-9.]+)\s*px/i.exec(style)?.[1];
    const num = (v: string | null | undefined) => (v == null ? null : Number(v));
    const width = num(w) ?? num(sw);
    const height = num(h) ?? num(sh);
    const isPixel =
      width != null && height != null && width <= 1 && height <= 1 && /(src|data-src)=/i.test(tag);
    if (isPixel) {
      removed++;
      return "";
    }
    return tag;
  });
  return { html: out, removed };
}
