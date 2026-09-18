import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// Local-first engine app: dev server exposes the UI + API routes that drive
// ComfyUI / git / the projects file tree. (Cloudflare deploys the static UI
// later; engine routes are local-only by design.)
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  server: { port: 4322, host: true },
});
