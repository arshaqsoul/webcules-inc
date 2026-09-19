/** @type {import('next').NextConfig} */

// Keep dev (`next dev --turbopack`) and production builds in separate output
// directories — building while the dev server runs otherwise corrupts .next
// (this bit us: the open-next bundle shipped turbopack artifacts).
const isDev = process.env.NODE_ENV === "development";

const nextConfig = {
  distDir: isDev ? ".next-dev" : ".next",
  transpilePackages: ["@webcules/ui"],
  images: {
    // Next.js image optimization requires sharp, which is not available on Cloudflare Workers
    unoptimized: true,
  },
};

export default nextConfig;
