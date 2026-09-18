import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "{{FORGE_URL}}",
  // static by default; add `export const prerender = false` to any route for on-demand SSR on Cloudflare
  adapter: cloudflare({ imageService: "passthrough" }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
