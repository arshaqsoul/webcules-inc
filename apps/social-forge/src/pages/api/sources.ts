import type { APIRoute } from "astro";
import { h, json } from "../../engine/api.ts";
import { SOURCES } from "../../engine/sources.ts";

export const GET: APIRoute = h(async () => json({ sources: SOURCES }));
