/* Throwaway audit: do the seed drafts (which the R2 picker thumbs were
 * rendered from) still match the shipped seed designs in seed-templates.ts? */
import { readdirSync, readFileSync } from "node:fs";

const src = readFileSync(new URL("../lib/seed-templates.ts", import.meta.url), "utf8");
const drafts = readdirSync(new URL("../tools/seed-drafts", import.meta.url)).filter((f) => f.endsWith(".json"));
let mismatches = 0;
for (const f of drafts) {
  const key = f.replace(/\.json$/, "");
  const draft = JSON.parse(readFileSync(new URL(`../tools/seed-drafts/${f}`, import.meta.url), "utf8"));
  const idx = src.indexOf(`"template":"${key}"`);
  if (idx === -1) {
    console.log(`${key}: no seed design found`);
    mismatches++;
    continue;
  }
  // walk the balanced JSON object starting at the brace before the match
  const start = src.lastIndexOf("{", idx);
  let depth = 0;
  let end = start;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      i++;
      while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  let seedDesign;
  try {
    seedDesign = JSON.parse(src.slice(start, end));
  } catch {
    console.log(`${key}: seed design parse fail`);
    mismatches++;
    continue;
  }
  const da = draft.design;
  const same = JSON.stringify(da) === JSON.stringify(seedDesign);
  if (same) {
    console.log(`${key}: MATCH`);
  } else {
    mismatches++;
    console.log(`${key}: DRIFT`);
    for (const k of new Set([...Object.keys(da), ...Object.keys(seedDesign)])) {
      if (JSON.stringify(da[k]) !== JSON.stringify(seedDesign[k])) {
        console.log(`   ${k}: draft=${JSON.stringify(da[k])?.slice(0, 100)} seed=${JSON.stringify(seedDesign[k])?.slice(0, 100)}`);
      }
    }
  }
}
console.log("---");
console.log(mismatches === 0 ? "all drafts match seeds" : `${mismatches} drifted`);
