/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@webcules/ui"],
  images: {
    // Next.js image optimization requires sharp, which is not available on Cloudflare Workers
    unoptimized: true,
  },
};

export default nextConfig;
