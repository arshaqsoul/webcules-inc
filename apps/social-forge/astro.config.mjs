import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// Demo gallery server: serves /demo/<slug> pages rendering the real components from
// @webcules/ui, so `social render` can record them. Engine routes are local-only by design.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  devToolbar: { enabled: false }, // must never appear in recorded renders
  vite: {
    plugins: [tailwindcss()],
    ssr: { noExternal: [/@webcules\/ui/] },
  },
  server: { port: 4322, host: true },
});
