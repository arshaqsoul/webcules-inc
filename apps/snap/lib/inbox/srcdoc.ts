/* Sandboxed-email srcdoc builder (WEB-305) — pure string builder the client
 * EmailFrame feeds to <iframe srcdoc>. Layered with the server sanitizer:
 * even if a script survived sanitization, the CSP (meta + frame sandbox)
 * keeps it inert. Forced white background by fiat — emails authored on light
 * themes must never inherit the app's dark mode (Close.com pattern). */
export function buildEmailSrcdoc(params: {
  /** Output of sanitizeEmailHtml (trusted by construction). */
  html: string;
  /** Click-to-load: when true, data-src images are promoted back to src. */
  loadImages: boolean;
}): string {
  const imgCsp = params.loadImages ? "img-src data: https: http: cid:" : "img-src data:";
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    imgCsp,
    "script-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
  const body = params.loadImages
    ? // Promote ONLY within img tags the sanitizer built — a literal
      // "data-src=" inside a text node must never morph into an attribute.
      params.html.replace(/(<img\b[^>]*?) data-src=/gi, "$1 src=")
    : params.html;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>
html,body{margin:0;padding:0;}
body{background:#ffffff;color:#16171a;font:14px/1.6 Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;word-break:break-word;}
img{max-width:100%;height:auto;}
img[data-src]{display:inline-block;min-width:64px;min-height:64px;border:1px dashed #d4d7dc;border-radius:6px;background:#f6f7f8 center/24px no-repeat;}
table{max-width:100%;}
a{color:#1a5fb4;}
</style></head><body>${body}</body></html>`;
}
