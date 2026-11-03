// Editorial headlines: one short, plain-English headline per moved bill, written
// by Claude from the title, abstract and (where we have it) the AI summary.
// Writes data/headlines.json / data/headlines.js. Re-runs skip bills already done.
//
// Usage:  ANTHROPIC_API_KEY=sk-ant-... node scripts/headlines.mjs
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFile, writeFile } from "node:fs/promises";
import { moved } from "./movement.mjs";

const client = new Anthropic();
const Headline = z.object({ headline: z.string().describe("At most 12 words. Plain English, present tense, what the bill does, no bill number, no state name, no trailing period. Like a newspaper deck: 'Betting operators must publish how they limit accounts'.") });

const data = JSON.parse(await readFile("data/bills.json", "utf8"));
let analysis = {}; try { analysis = JSON.parse(await readFile("data/analysis.json", "utf8")); } catch {}
let out = {}; try { out = JSON.parse(await readFile("data/headlines.json", "utf8")); } catch {}
const todo = data.bills.filter((b) => moved(b) && !out[b.id]);
console.error(`${todo.length} headlines to write (${Object.keys(out).length} done)`);
let i = 0, tok = { in: 0, out: 0 };
async function worker() {
  while (i < todo.length) {
    const b = todo[i++];
    try {
      const res = await client.messages.parse({
        model: process.env.MODEL || "claude-sonnet-5-5", max_tokens: 200, output_config: { effort: "low", format: zodOutputFormat(Headline) },
        system: "You write one-line editorial headlines for a legislative tracker used by regulatory lawyers. Be specific and concrete; prefer the substantive effect over procedure.",
        messages: [{ role: "user", content: `Bill ${b.state} ${b.number}: ${b.title}\nAbstract: ${(b.description || "").slice(0, 600)}\n${analysis[b.id] ? `Summary: ${analysis[b.id].summary}` : ""}` }],
      });
      if (res.parsed_output) { out[b.id] = res.parsed_output.headline; tok.in += res.usage.input_tokens; tok.out += res.usage.output_tokens; }
      if (Object.keys(out).length % 50 === 0) { await writeFile("data/headlines.json", JSON.stringify(out, null, 1)); console.error(`  ${Object.keys(out).length} done`); }
    } catch (e) { console.error(`  ${b.id}: ${e.message}`); if (/credit balance/i.test(e.message)) i = todo.length; }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
await writeFile("data/headlines.json", JSON.stringify(out, null, 1));
await writeFile("data/headlines.js", `window.STATECRAFT_HEADLINES = ${JSON.stringify(out)};\n`);
console.error(`Done: ${Object.keys(out).length} headlines. This run ≈ $${((tok.in * 4 + tok.out * 20) / 1e6).toFixed(2)}.`);
