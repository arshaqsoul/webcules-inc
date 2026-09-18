/**
 * Single source of truth for site copy & structure.
 * Restyle/regenerate freely — components read from here.
 */
export const site = {
  name: "{{FORGE_TITLE}}",
  tagline: "{{FORGE_DESC}}",
  description: "{{FORGE_DESC}}",
  url: "{{FORGE_URL}}",

  nav: [
    { label: "Product", href: "#features" },
    { label: "Showcase", href: "#showcase" },
    { label: "Numbers", href: "#stats" },
  ],
  cta: { label: "Get started", href: "#cta" },

  hero: {
    eyebrow: "Now in public beta",
    // keep it short, punchy, two lines max — break with an accent word
    titleA: "Build something",
    titleAccent: "unreasonably",
    titleB: "good.",
    sub: "{{FORGE_DESC}} Replace every word on this page with real positioning — the layout, type and motion are the product here.",
  },

  logos: ["VERTEX", "Halcyon", "NORTHWIND", "Osmo", "Kite&Co", "Ferro", "LUMEN", "Atlas9"],

  features: [
    {
      tag: "Design",
      title: "Typography that carries the room",
      desc: "A display face with real character, set tight and huge, is 80% of why a site feels expensive. Swap the pairing per brief.",
      span: "md:col-span-4",
    },
    {
      tag: "Motion",
      title: "Choreographed, not decorated",
      desc: "One easing vocabulary. Reveals, parallax and hover states that answer the scroll instead of fighting it.",
      span: "md:col-span-2",
    },
    {
      tag: "Assets",
      title: "Art generated in-house",
      desc: "Every visual — hero loops, textures, OG cards — comes off the local ComfyUI pipeline. No stock-photo smell.",
      span: "md:col-span-3",
    },
    {
      tag: "Speed",
      title: "Fast because it's boring inside",
      desc: "Static HTML, islands only where they earn their bytes, served from Cloudflare's edge. Lighthouse loves it.",
      span: "md:col-span-3",
    },
  ],

  showcase: [
    {
      index: "01",
      title: "A hero that moves",
      desc: "Full-bleed generated loop under a huge display headline. One idea, executed hard.",
    },
    {
      index: "02",
      title: "Sticky storytelling",
      desc: "Sections that pin and reveal as you scroll — narrative without a single carousel.",
    },
    {
      index: "03",
      title: "A close worth scrolling for",
      desc: "The CTA is a statement, not an afterthought. Big type, magnetic button, done.",
    },
  ],

  stats: [
    { value: 100, suffix: "", label: "Lighthouse, or it doesn't ship" },
    { value: 4, suffix: " steps", label: "research → assets → build → deploy" },
    { value: 0, suffix: "", label: "stock photos harmed" },
    { value: 16, suffix: " GB", label: "of local VRAM doing the art" },
  ],
};

export type Site = typeof site;
