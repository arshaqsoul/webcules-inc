import { chromium } from "@playwright/test";
const url = process.argv[2], out = process.argv[3], w = Number(process.argv[4] ?? 1280), h = Number(process.argv[5] ?? 900);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto(url, { waitUntil: "load", timeout: 120000 });
await p.waitForTimeout(5000);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log("shot:", out);
