// Bundles data/texts/*.json into data/texts.js so the model-bill comparison
// can run in the browser without a backend. Text is capped per bill to keep
// the bundle small.
import { readdir, readFile, writeFile } from "node:fs/promises";

const CAP = 30000;
const files = (await readdir("data/texts")).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const out = {};
let total = 0;
for (const f of files) {
  const t = JSON.parse(await readFile(`data/texts/${f}`, "utf8"));
  if (t.text && t.text.length > 400) {
    const clean = t.text.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/�/g, "").replace(/[ \t]+/g, " ");
    out[t.id] = clean.slice(0, CAP); total += out[t.id].length;
  }
}
await writeFile("data/texts.js", `window.STATECRAFT_TEXTS = ${JSON.stringify(out)};\n`);
console.error(`Bundled ${Object.keys(out).length} bill texts, ${(total / 1e6).toFixed(1)} MB.`);
