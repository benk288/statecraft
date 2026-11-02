// One-off: re-key analysis.json and data/texts from Open States ids to the
// LegiScan-era "ST-NUMBER" keys so the first batch of AI analyses is kept.
import { readFile, writeFile, readdir, rename } from "node:fs/promises";
import { billKey } from "./fetch_legiscan.mjs";

const old = JSON.parse(await readFile("data/bills.openstates.json", "utf8"));
const keyOf = Object.fromEntries(old.bills.map((b) => [b.id, billKey(b.state, b.number)]));
const current = new Set(JSON.parse(await readFile("data/bills.json", "utf8")).bills.map((b) => b.id));

let analysis = {};
try { analysis = JSON.parse(await readFile("data/analysis.json", "utf8")); } catch {}
const migrated = {};
let kept = 0, dropped = 0;
for (const [id, a] of Object.entries(analysis)) {
  const k = id.startsWith("ocd-bill/") ? keyOf[id] : id;
  if (k && current.has(k)) { migrated[k] = a; kept++; } else dropped++;
}
await writeFile("data/analysis.json", JSON.stringify(migrated, null, 1));
await writeFile("data/analysis.js", `window.STATECRAFT_ANALYSIS = ${JSON.stringify(migrated)};\n`);

let tkept = 0;
for (const f of await readdir("data/texts")) {
  if (!f.endsWith(".json") || f.startsWith("_")) continue;
  const t = JSON.parse(await readFile(`data/texts/${f}`, "utf8"));
  if (!t.id.startsWith("ocd-bill/")) continue;
  const k = keyOf[t.id];
  if (k && current.has(k)) { t.id = k; await writeFile(`data/texts/${k}.json`, JSON.stringify(t)); tkept++; }
  await rename(`data/texts/${f}`, `data/texts/_old_${f}`);
}
console.error(`analysis: kept ${kept}, dropped ${dropped} (not in LegiScan set); texts re-keyed: ${tkept}`);
