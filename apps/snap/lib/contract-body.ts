/* Contract body rendering (WEB-251) — ONE renderer shared by the public
 * signing page, the editor's live preview and the preview endpoint, so
 * preview and signature can never drift. Bodies are plain text by default
 * (paragraphs on blank lines, escaped, whitespace visible); bodies written
 * with the editor's rich toolbar arrive as sanitized allowlist HTML and
 * render as such. */
import { sanitizeRichText } from "./sanitize";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function bodyIsHtml(body: string): boolean {
  return /<(p|br|strong|em|u|ul|ol|li|h3|h4|blockquote|a)\b/i.test(body);
}

/** Safe HTML for the signing page / preview. Plain-text bodies become
 * paragraphs (blank-line separated); HTML bodies are re-sanitized
 * (idempotent — they were sanitized at save). */
export function renderContractBodyHtml(body: string): string {
  if (bodyIsHtml(body)) return sanitizeRichText(body);
  return body
    .split(/\n{2,}/)
    .map((para) => (para.trim() ? `<p>${escapeHtml(para).replace(/\n/g, "<br />")}</p>` : ""))
    .join("");
}

/** Plain-text projection for the PDF renderer: HTML bodies are flattened
 * (block tags become line breaks; the rest strips to text), plain bodies
 * pass through untouched. */
export function contractBodyToText(body: string): string {
  if (!bodyIsHtml(body)) return body;
  return body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h3|h4|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
