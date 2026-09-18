import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { importForgeProject } from "@/app/actions";
import { auth } from "@/lib/auth";
import { scanForgeProjects } from "@/lib/forge";
import { db } from "@/db";
import { projects } from "@/db/schema";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { slug } = (await req.json()) as { slug: string };
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const existing = await db.select({ slug: projects.slug }).from(projects);
  const found = await scanForgeProjects(new Set(existing.map((p) => p.slug)));
  const item = found.find((f) => f.slug === slug);
  if (!item) return NextResponse.json({ error: `No gtm.json found for "${slug}" — rescan the Forge page` }, { status: 404 });

  try {
    const leadId = await importForgeProject(item.gtm);
    return NextResponse.json({ ok: true, leadId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 400 });
  }
}
