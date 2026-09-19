/* pnpm forge:list */
import { readLibrary, log } from "./lib/common.mjs";

const lib = readLibrary();
if (!lib.components.length) { console.log("library is empty — pnpm forge:new <name>"); }
const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
console.log("\nNAME                PHASE      PREMIUM   DOCS        TITLE");
console.log("─".repeat(90));
for (const c of lib.components) {
  console.log(
    pad(c.name, 20) +
      pad(c.phase, 11) +
      pad(c.premium ? "🔒 yes" : "no", 10) +
      pad(c.docsMode, 12) +
      c.title,
  );
}
console.log(
  "\n" + lib.components.length + " component(s) · "
  + lib.components.filter((c) => c.phase === "approved").length + " approved · "
  + lib.components.filter((c) => c.premium).length + " premium\n",
);
