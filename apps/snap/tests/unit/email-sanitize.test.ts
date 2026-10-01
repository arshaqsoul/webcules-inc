/* WEB-305 — email display sanitizer: the XSS corpus every renderer of
 * third-party HTML must survive (script smuggling, event handlers, URI
 * schemes, remote-image tracking), plus the balancing guarantees that keep
 * a malformed email from bleeding into the frame shell. */
import { describe, expect, it } from "vitest";

import { sanitizeEmailHtml } from "@/lib/inbox/sanitize-email";

describe("sanitizeEmailHtml — XSS corpus", () => {
  it("drops script elements with their content entirely", () => {
    const out = sanitizeEmailHtml('<p>hi</p><script>alert(1)</script><p>bye</p>');
    expect(out.html).toBe("<p>hi</p><p>bye</p>");
    expect(out.html).not.toContain("alert");
  });

  it("drops iframe/object/embed/form/input with content", () => {
    const html = [
      '<iframe src="https://evil.example"></iframe>',
      '<object data="x"></object>',
      "<embed src=\"x\">",
      '<form action="https://evil.example"><input name="a" value="b"></form>',
      '<svg onload="alert(1)"><circle r="1"/></svg>',
    ].join("");
    const out = sanitizeEmailHtml(html);
    expect(out.html).toBe("");
    expect(out.html).not.toContain("iframe");
    expect(out.html).not.toContain("<input");
  });

  it("never re-emits on* handlers regardless of tag", () => {
    const out = sanitizeEmailHtml(
      '<p onclick="alert(1)" onmouseover="x" ONFOCUS="y">safe</p><img src="https://t.test/x.png" onerror="alert(2)">',
    );
    expect(out.html).not.toMatch(/on[a-z]+\s*=/i);
    expect(out.html).toContain("safe");
  });

  it("kills javascript:/vbscript:/data: hrefs, keeps http(s)/mailto", () => {
    const out = sanitizeEmailHtml(
      '<a href="javascript:alert(1)">a</a><a href="vbscript:x">b</a><a href="data:text/html;base64,x">c</a>' +
        '<a href="https://ok.test/page">d</a><a href="mailto:x@y.test">e</a>',
    );
    expect(out.html).not.toContain("javascript:");
    expect(out.html).not.toContain("vbscript:");
    expect(out.html).not.toContain("data:text/html");
    expect(out.html).toContain('href="https://ok.test/page"');
    expect(out.html).toContain('href="mailto:x@y.test"');
    // Only safe links get target/rel; dead ones stay plain anchors.
    expect(out.html.match(/target="_blank"/g)?.length).toBe(2);
  });

  it("withholds remote images as data-src and counts them; data: images pass", () => {
    const out = sanitizeEmailHtml(
      '<img src="https://tracker.test/pixel.png" alt="p"><img src="http://cdn.example/a.jpg">' +
        '<img src="data:image/png;base64,iVBORw0KGgo=">',
    );
    expect(out.remoteImages).toBe(2);
    expect(out.html).not.toMatch(/\ssrc="https?:/i); // only data-src carries remotes
    expect(out.html).toContain('data-src="https://tracker.test/pixel.png"');
    expect(out.html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });

  it("strips url() and expression() from inline styles, keeps colors", () => {
    const out = sanitizeEmailHtml(
      '<p style="color:#333;background:url(https://t.test/x)">t</p><div style="width:expression(alert(1))">d</div>',
    );
    expect(out.html).toContain("color:#333");
    expect(out.html).not.toContain("url(");
    expect(out.html).not.toContain("expression");
  });

  it("drops style elements and link/meta so email CSS can never re-skin the frame", () => {
    const out = sanitizeEmailHtml("<style>body{background:url(https://t.test/c)}</style><p>x</p><link rel=stylesheet href=https://t.test/s.css>");
    expect(out.html).toBe("<p>x</p>");
  });

  it("keeps email table layout attributes", () => {
    const out = sanitizeEmailHtml('<table width="600" cellpadding="0" cellspacing="0" border="0"><tr><td width="300" align="center">c</td></tr></table>');
    expect(out.html).toContain('width="600"');
    expect(out.html).toContain('cellpadding="0"');
    expect(out.html).toContain('align="center"');
  });

  it("balances unclosed tags so formatting cannot bleed into the shell", () => {
    const out = sanitizeEmailHtml("<div><strong>unclosed");
    expect(out.html).toBe("<div><strong>unclosed</strong></div>");
  });

  it("auto-closes implicit siblings the way browsers do", () => {
    const out = sanitizeEmailHtml("<ul><li>one<li>two</ul><p>a<p>b");
    expect(out.html).toBe("<ul><li>one</li><li>two</li></ul><p>a</p><p>b</p>");
  });

  it("renders stray < as text and survives comments/doctypes", () => {
    const out = sanitizeEmailHtml("<!-- hidden -->3 < 5<p>ok</p>");
    expect(out.html).not.toContain("hidden");
    expect(out.html).toContain("3 &lt; 5");
    expect(out.html).toContain("<p>ok</p>");
  });

  it("is entity-preserving stable under double sanitize", () => {
    const once = sanitizeEmailHtml("<p>a &amp; b &lt;tag&gt;</p>").html;
    expect(sanitizeEmailHtml(once).html).toBe(once);
  });

  it("cid: image references drop (client shows alt text)", () => {
    const out = sanitizeEmailHtml('<img src="cid:part1.abc" alt="photo">');
    expect(out.html).toContain('alt="photo"');
    expect(out.html).not.toContain("cid:");
  });
});
