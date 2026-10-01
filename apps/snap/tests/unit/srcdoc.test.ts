/* WEB-305 — the srcdoc wall: a CSP that forbids scripts/objects/forms even
 * if something survived sanitization, a forced white card (dark-mode
 * inversion by fiat), and the click-to-load image switch. */
import { describe, expect, it } from "vitest";

import { buildEmailSrcdoc } from "@/lib/inbox/srcdoc";

describe("buildEmailSrcdoc", () => {
  const base = { html: "<p>hello</p>" };

  it("embeds a script-src 'none' CSP with object/frame/form denials", () => {
    const doc = buildEmailSrcdoc({ ...base, loadImages: false });
    expect(doc).toContain("script-src 'none'");
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("object-src 'none'");
    expect(doc).toContain("frame-src 'none'");
    expect(doc).toContain("form-action 'none'");
    expect(doc).toContain('http-equiv="Content-Security-Policy"');
  });

  it("withholds remote images by default and promotes them on load", () => {
    const html = '<img data-src="https://t.test/a.png"><img src="data:image/png;base64,iVBORw0KGgo=">';
    const blocked = buildEmailSrcdoc({ html, loadImages: false });
    expect(blocked).toContain("img-src data:");
    expect(blocked).not.toMatch(/img-src data: https/);
    expect(blocked).not.toMatch(/\ssrc="https:\/\//); // only data-src carries remotes
    expect(blocked).toContain('data-src="https://t.test/a.png"');

    const loaded = buildEmailSrcdoc({ html, loadImages: true });
    expect(loaded).toContain("img-src data: https: http: cid:");
    expect(loaded).toContain('src="https://t.test/a.png"');
    expect(loaded).not.toContain("data-src=");
  });

  it("promotes data-src only inside img tags — literal text survives untouched", () => {
    const html = "<p>the attribute is called data-src= here</p><img data-src=\"https://t.test/a.png\" alt=\"x\">";
    const loaded = buildEmailSrcdoc({ html, loadImages: true });
    expect(loaded).toContain("the attribute is called data-src= here");
    expect(loaded).toContain('src="https://t.test/a.png"');
  });

  it("forces the white card so light-authored emails never invert in dark mode", () => {
    const doc = buildEmailSrcdoc({ ...base, loadImages: false });
    expect(doc).toMatch(/background:\s*#ffffff/i);
    expect(doc).not.toMatch(/prefers-color-scheme/i);
  });
});
