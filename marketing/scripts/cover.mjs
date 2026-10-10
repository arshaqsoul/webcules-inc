// Facebook cover (1640x624) for a brand. Content stays inside the centre safe zone because mobile crops the sides.
//   node marketing/scripts/cover.mjs snap "art prompt" [seed]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { generate } from "./art.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const M = path.join(ROOT, "marketing");
const [name, prompt, seed] = process.argv.slice(2);
const brand = JSON.parse(fs.readFileSync(path.join(M, "brands", `${name}.json`), "utf8"));
const t = brand.theme;
const art = path.join(M, "art", `cover-${name}.png`);
if (!fs.existsSync(art)) await generate({ prompt: `${prompt}, ${brand.artStyle}`, out: art, w: 1648, h: 624, seed: seed ? +seed : undefined });
const url = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=${t.sans}:wght@500;600;700&family=Instrument+Serif:ital@1&display=swap" rel="stylesheet"><style>
*{margin:0;box-sizing:border-box}body{width:1640px;height:624px;position:relative;overflow:hidden;background:${t.bg};font-family:"${t.sans}",sans-serif;color:${t.ink}}
.art{position:absolute;inset:0;background:url(${url(art)}) center/cover}.shade{position:absolute;inset:0;background:radial-gradient(ellipse 45% 70% at 50% 50%,${t.bg}cc,${t.bg}00)}
.c{position:absolute;left:300px;right:300px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:26px}
.logo{display:flex;align-items:center;gap:22px}.logo img{width:96px;height:96px;border-radius:${brand.cover.logoRadius}}.logo b{font-size:84px;font-weight:700;letter-spacing:-.04em}
h2{font-size:44px;line-height:1.15;font-weight:600;letter-spacing:-.025em}h2 em{font-family:"Instrument Serif",serif;font-style:italic;font-weight:400;color:${t.accent}}
.sub{font-size:30px;color:${t.muted};margin-top:-6px}.pill{font-size:28px;font-weight:600;background:${t.button};color:${t.buttonInk};border-radius:999px;padding:14px 38px}
</style></head><body><div class="art"></div><div class="shade"></div><div class="c">
<div class="logo"><img src="${url(path.join(M, brand.logo))}"><b>${brand.name}</b></div>
<h2>${brand.cover.headline.replace(/\*([^*]+)\*/g, "<em>$1</em>")}</h2>${brand.cover.sub ? `<div class="sub">${brand.cover.sub}</div>` : ""}
<div class="pill">${brand.cover.pill}</div></div></body></html>`;
const { chromium } = createRequire(path.join(ROOT, "apps", "snap", "package.json"))("@playwright/test");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1640, height: 624 } });
await p.setContent(html, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
const out = path.join(M, "out", `cover-${name}.png`);
await p.screenshot({ path: out });
await b.close();
console.log(path.relative(ROOT, out));
