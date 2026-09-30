/* GET /llms.txt — the LLM discovery convention: a Markdown index of the
 * documentation with one clean .md URL per page. Generated from the docs
 * nav so it never drifts from the sidebar. */
import { DOC_CATEGORIES } from "@/lib/docs/nav";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const lines: string[] = [
    "# Snap documentation",
    "",
    "> Snap is the studio platform for photographers: leads, bookings, projects, client galleries, contracts, invoices, and payouts in one place. Each page below is also available as clean Markdown at its .md URL.",
    "",
  ];
  for (const category of DOC_CATEGORIES) {
    lines.push(`## ${category.label}`);
    lines.push("");
    for (const page of category.pages) {
      lines.push(`- [${page.title}](${origin}/docs/${page.slug}.md): ${page.description}`);
    }
    lines.push("");
  }
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
