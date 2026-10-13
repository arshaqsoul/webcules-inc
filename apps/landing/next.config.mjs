/** @type {import('next').NextConfig} */
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { fileURLToPath } from "node:url";

// Keep dev (`next dev --turbopack`) and production builds in separate output
// directories — building while the dev server runs otherwise corrupts .next
// (this bit us: the open-next bundle shipped turbopack artifacts).
const isDev = process.env.NODE_ENV === "development";

// Wire `getCloudflareContext()` to wrangler's platform proxy during `next dev`
// so API routes can reach local D1 + .dev.vars secrets (bindings + auth env).
// remoteBindings: false keeps dev on the LOCAL D1 database — same rule as the
// payload config ("regular builds and dev never touch production data");
// apply migrations locally with `pnpm db:migrate`. No-op for prod builds.
if (isDev) {
  initOpenNextCloudflareForDev({ remoteBindings: false });
}

const nextConfig = {
  distDir: isDev ? ".next-dev" : ".next",
  // Pin the tracing root to the monorepo root so workspace-root inference is
  // deterministic (stray lockfiles elsewhere on the machine otherwise confuse
  // Next's search for the workspace root).
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  transpilePackages: ["@webcules/ui"],
  images: {
    // Next.js image optimization requires sharp, which is not available on Cloudflare Workers
    unoptimized: true,
  },
};

export default nextConfig;
