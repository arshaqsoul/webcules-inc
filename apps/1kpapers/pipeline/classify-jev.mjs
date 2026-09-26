// Classifies catalog papers into editorial collections with Jev (TypeSafe AI's
// System One model), accessed through a Cloudflare AI Gateway — the same role
// Jev played in the original 1kpapers experiment.
//
// Required environment:
//   AIG_GATEWAY_NAME   name of the AI Gateway on the Cloudflare account
//   CF_AIG_TOKEN       AI Gateway auth token (or one that the gateway accepts)
// Optional:
//   CLOUDFLARE_ACCOUNT_ID  defaults to the account wrangler is logged into
//   AIG_BASE_URL           full base URL override; skips the two above
//   JEV_MODEL              defaults to "jev" (the System One model id)
//
// Usage:  node pipeline/classify-jev.mjs
// Output: pipeline/out/jev-classification.json — picked up automatically by
//         `node pipeline/build-storage.mjs`, which prefers Jev topic decisions
//         over the GLM Flash fallback classification.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(root, "pipeline", "source");
const outDir = path.join(root, "pipeline", "out");
const catalogPath = path.join(root, "public", "storage", "catalog.json");

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "5677ff5e25a4e78485b774931f981681";
const GATEWAY = process.env.AIG_GATEWAY_NAME;
const TOKEN = process.env.CF_AIG_TOKEN ?? process.env.TYPESAFE_API_KEY;
const MODEL = process.env.JEV_MODEL ?? "jev-latest";
const BASE_URL = process.env.AIG_BASE_URL
  ?? (GATEWAY ? `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/${GATEWAY}` : undefined);

if (!BASE_URL || !TOKEN) {
  console.error(
    "Missing AI Gateway configuration. Set AIG_GATEWAY_NAME and CF_AIG_TOKEN\n" +
    "(or AIG_BASE_URL plus CF_AIG_TOKEN) and re-run: node pipeline/classify-jev.mjs",
  );
  process.exit(1);
}

const ENDPOINT = `${BASE_URL}/typesafe/v1/systemone`;
const taxonomy = JSON.parse(fs.readFileSync(path.join(sourceDir, "taxonomy.json"), "utf8"));
const topicChoices = taxonomy.topics.map((t) => t.slug);
const topicGuide = taxonomy.topics.map((t) => `${t.slug}: ${t.description}`).join("\n");

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
console.log(`classifying ${catalog.papers.length} papers with ${MODEL} at ${ENDPOINT}`);

function buildState(paper) {
  return {
    taskId: "paper-topic-classification",
    state: {
      title: paper.title,
      abstract: (paper.abstract ?? "").slice(0, 1500),
      summary: paper.summary.slice(0, 1500),
      primaryArxivCategory: (paper.categories ?? [])[0] ?? null,
      officialLab: paper.lab ?? null,
    },
    questions: [
      {
        name: "primaryTopic",
        kind: "Choice",
        values: topicChoices,
        required: true,
        description: `The single collection that best matches the paper's PRIMARY contribution (the artifact it presents, not its application domain).\n${topicGuide}`,
      },
      {
        name: "secondaryTopic",
        kind: "Choice",
        values: topicChoices,
        required: false,
        description: "A second clearly relevant collection, or null when the paper fits only one.",
      },
      {
        name: "confidence",
        kind: "Score",
        required: true,
        description: "Calibrated confidence (0..1) in the primary topic choice.",
      },
    ],
  };
}

async function classify(paper, attempt = 1) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, ...buildState(paper) }),
  });
  if (!response.ok) {
    if (response.status >= 500 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return classify(paper, attempt + 1);
    }
    throw new Error(`Jev request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  const data = await response.json();
  const answers = data.answers ?? data.result?.answers ?? data;
  const pick = (name) => {
    const answer = answers[name];
    if (!answer) return null;
    return typeof answer === "object" ? answer.value ?? answer.choice ?? null : answer;
  };
  const score = (name) => {
    const answer = answers[name];
    if (typeof answer === "number") return answer;
    if (answer && typeof answer === "object") return answer.probability ?? answer.score ?? answer.value ?? null;
    return null;
  };
  return {
    slug: paper.slug,
    primaryTopic: pick("primaryTopic"),
    secondaryTopic: pick("secondaryTopic"),
    confidence: score("confidence") ?? score("primaryTopic"),
    raw: data,
  };
}

const results = [];
const queue = [...catalog.papers];
const CONCURRENCY = 4;
let done = 0;
const failures = [];

async function worker() {
  while (queue.length) {
    const paper = queue.shift();
    try {
      results.push(await classify(paper));
    } catch (error) {
      failures.push({ slug: paper.slug, error: String(error) });
    }
    done += 1;
    process.stdout.write(`\r${done}/${catalog.papers.length}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log("");

const outputPath = path.join(outDir, "jev-classification.json");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, results }, null, 1));

if (failures.length) {
  console.error(`${failures.length} papers failed:`);
  for (const failure of failures) console.error(` - ${failure.slug}: ${failure.error}`);
  process.exitCode = 1;
} else {
  console.log(`wrote ${results.length} classifications to ${outputPath}`);
  console.log("next: node pipeline/build-storage.mjs");
}
