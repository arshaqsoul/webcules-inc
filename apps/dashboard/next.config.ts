import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // separate dev (turbopack) and production build output — sharing .next corrupts both
  distDir: process.env.NODE_ENV === "production" ? ".next" : ".next-dev",
  serverExternalPackages: ["@libsql/client", "libsql"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
