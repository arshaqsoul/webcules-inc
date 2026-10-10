// Renders post specs (marketing/posts/*.json) into finished 1080x1350 posters in marketing/out/.
//   node marketing/scripts/poster.mjs [post-id ...] [--regen-art]
// Artwork comes from ComfyUI (Qwen-Image, text-free). Every word on the poster is HTML, and contact details come
// from the brand file, never from the post spec, so a phone number or URL cannot be garbled or drift between posts.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { generate } from "./art.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const M = path.join(ROOT, "marketing");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// *word* renders in the serif italic accent, like the landing page headline.
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");

export function html(spec, brand, artDataUrl, logoDataUrl, shots) {
  const t = brand.theme;
  const fonts = [t.sans, t.serif].filter((v, i, a) => a.indexOf(v) === i);
  const gf = fonts.map((f) => `family=${f.replace(/ /g, "+")}${f === "Instrument Serif" ? ":ital@0;1" : ":wght@400;500;600;700"}`).join("&");
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?${gf}&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1080px;height:1350px;position:relative;overflow:hidden;background:${t.bg};color:${t.ink};font-family:"${t.sans}",system-ui,sans-serif}
  .art{position:absolute;inset:0;background:url(${artDataUrl}) center/cover}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,${t.bg}e6 0%,${t.bg}b3 30%,${t.bg}00 58%,${t.bg}00 66%,${t.bg}e0 86%,${t.bg}f2 100%)}
  .wrap{position:absolute;inset:0;padding:72px 80px;display:flex;flex-direction:column}
  .top{display:flex;align-items:center;gap:20px}
  .top img{width:84px;height:84px;border-radius:50%}
  .brand{font-size:34px;font-weight:600;letter-spacing:-.01em}
  .kicker{margin-left:auto;font-size:24px;color:${t.accent};border:1.5px solid ${t.accent}66;border-radius:999px;padding:10px 24px}
  h1{margin-top:96px;font-size:104px;line-height:1.02;letter-spacing:-.035em;font-weight:600;text-wrap:balance}
  h1 em{font-family:"${t.serif}",serif;font-style:italic;font-weight:400;color:${t.accent};letter-spacing:-.01em}
  .sub{margin-top:36px;text-shadow:0 2px 18px ${t.bg},0 0 4px ${t.bg}99;font-size:36px;line-height:1.4;color:${t.muted};max-width:860px}
  .shots{position:relative;height:440px;margin-top:30px}
  .win{position:absolute;left:0;top:10px;width:640px;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 30px 70px #000a,0 0 0 1.5px #ffffff22}
  .win .bar{height:34px;background:#ececf2;display:flex;align-items:center;gap:8px;padding-left:16px}
  .win .bar i{width:11px;height:11px;border-radius:50%;background:#c9c9d3}
  .win img{display:block;width:640px;height:380px;object-fit:cover;object-position:top}
  .phone{position:absolute;right:10px;top:-10px;width:210px;height:436px;border-radius:38px;border:7px solid #15152e;overflow:hidden;background:#fff;box-shadow:0 30px 70px #000b,0 0 0 1.5px #ffffff33}
  .phone img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
  .spacer{flex:1}
  .cta{display:flex;align-items:center;gap:28px}
  .btn{background:${t.button};color:${t.buttonInk};border-radius:999px;padding:28px 52px;font-size:38px;font-weight:600;white-space:nowrap}
  .contact{text-shadow:0 2px 14px ${t.bg};font-size:28px;line-height:1.5;color:${t.muted}}
  .contact b{color:${t.ink};font-weight:600}
  .foot{margin-top:34px;padding-top:26px;border-top:1.5px solid ${t.ink}22;font-size:26px;color:${t.muted};display:flex;justify-content:space-between}
</style></head><body>
<div class="art"></div><div class="shade"></div>
<div class="wrap">
  <div class="top">${logoDataUrl ? `<img src="${logoDataUrl}">` : ""}<div class="brand">${esc(brand.name)}</div>${spec.kicker ? `<div class="kicker">${esc(spec.kicker)}</div>` : ""}</div>
  <h1${spec.headlineSize ? ` style="font-size:${spec.headlineSize}px;margin-top:70px"` : ""}>${rich(spec.headline)}</h1>
  ${spec.sub ? `<p class="sub">${rich(spec.sub)}</p>` : ""}
  ${shots ? `<div class="shots"><div class="win"><div class="bar"><i></i><i></i><i></i></div><img src="${shots.desktop}"></div><div class="phone"><img src="${shots.phone}"></div></div>` : ""}
  <div class="spacer"></div>
  <div class="cta"><div class="btn">${esc(spec.cta)}</div>
    <div class="contact"><b>${esc(brand.contactLines[0])}</b>${brand.contactLines.slice(1).map((l) => `<br>${esc(l)}`).join("")}</div></div>
  <div class="foot"><span>${esc(brand.domain)}</span><span>${esc(brand.location)}</span></div>
</div></body></html>`;
}

const dataUrl = (file) => `data:image/${path.extname(file).slice(1)};base64,${fs.readFileSync(file).toString("base64")}`;

async function main() {
  const args = process.argv.slice(2);
  const regen = args.includes("--regen-art");
  const ids = args.filter((a) => !a.startsWith("--"));
  const files = fs.readdirSync(path.join(M, "posts")).filter((f) => f.endsWith(".json")).filter((f) => !ids.length || ids.includes(f.replace(/\.json$/, "")));
  const { chromium } = createRequire(path.join(ROOT, "apps", "snap", "package.json"))("@playwright/test");
  const browser = await chromium.launch();
  for (const f of files) {
    const spec = JSON.parse(fs.readFileSync(path.join(M, "posts", f), "utf8"));
    const brand = JSON.parse(fs.readFileSync(path.join(M, "brands", `${spec.brand}.json`), "utf8"));
    const art = path.join(M, "art", `${spec.art.from ?? spec.id}.png`);
    if (regen || !fs.existsSync(art)) {
      console.log(`[${spec.id}] generating artwork...`);
      const r = await generate({ prompt: `${spec.art.prompt}, ${brand.artStyle}`, out: art, seed: spec.art.seed });
      console.log(`[${spec.id}] artwork seed ${r.seed} in ${r.seconds}s`);
    }
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await page.setContent(html(spec, brand, dataUrl(art), brand.logo ? dataUrl(path.join(M, brand.logo)) : null, spec.shots ? { desktop: dataUrl(path.join(M, spec.shots.desktop)), phone: dataUrl(path.join(M, spec.shots.phone)) } : null), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const text = await page.evaluate(() => document.body.innerText);
    for (const must of brand.require) if (!text.includes(must)) throw new Error(`[${spec.id}] missing "${must}" on the poster`);
    const out = path.join(M, "out", `${spec.id}.png`);
    await page.screenshot({ path: out });
    fs.writeFileSync(path.join(M, "out", `${spec.id}.caption.txt`), `${spec.caption}\n\nBook a call: https://${brand.booking}\nOr call ${brand.phone}\n\n${(spec.hashtags ?? []).join(" ")}\n`);
    console.log(`[${spec.id}] ${path.relative(ROOT, out)}`);
    await page.close();
  }
  await browser.close();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
