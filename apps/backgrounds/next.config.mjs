import { withPayload } from "@payloadcms/next/withPayload";
import createMDX from "@next/mdx";
const withMDX = createMDX({
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  transpilePackages: ["@webcules/ui"],
  images: {
    qualities: [50, 100],
    remotePatterns: [
      // Your Next.js app images
      {
        protocol: "http",
        hostname: "localhost",
        port: "3002",
      },
      // Payload CMS images
      {
        protocol: "http",
        hostname: "localhost",
        port: "3001",
        pathname: "/api/media/**",
      },
      // For production
      ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? [
            {
              protocol: "https",
              hostname: process.env.VERCEL_PROJECT_PRODUCTION_URL,
            },
          ]
        : []),
    ],
  },
};

export default withPayload(withMDX(nextConfig));
