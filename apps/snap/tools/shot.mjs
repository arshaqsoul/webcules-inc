import { chromium } from "@playwright/test";
// args: <url> <out> [width=1280] [height=900] [mode=full]
// mode: "full" = full-page screenshot; "clip" = exactly the viewport box
// (template picker thumbs); "view" = the visible viewport only.
const url = process.argv[2], out = process.argv[3], w = Number(process.argv[4] ?? 1280), h = Number(process.argv[5] ?? 900), mode = process.argv[6] ?? "full";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto(url, { waitUntil: "load", timeout: 120000 });
await p.waitForTimeout(5000);
await p.screenshot(mode === "clip" ? { path: out, clip: { x: 0, y: 0, width: w, height: h } } : { path: out, fullPage: mode === "full" });
await b.close();
console.log("shot:", out);
