// Phase 3: Claude reads each moved bill's text and writes a plain-English
// summary, the key provisions, and how the bill differs from other states'
// bills on the same issues. Output goes to data/analysis.js for the app.
//
// Usage:  ANTHROPIC_API_KEY=sk-ant-... node scripts/summarize.mjs
// Re-runs skip bills already analysed; delete data/analysis.json to redo.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFile, readdir, writeFile } from "node:fs/promises";

const MODEL = "claude-opus-5-5";
const CONCURRENCY = 4;
const MAX_TEXT = 50000; // chars of bill text per request

const ISSUES = [
  { key: "tax", label: "Tax rate", re: /\btax(es|ation|ed)?\b|gross (gaming|wagering) revenue|privilege fee|excise/i },
  { key: "prediction", label: "Prediction markets", re: /prediction market|event contract|futures|cftc|derivative/i },
  { key: "advertising", label: "Advertising", re: /advertis|marketing|promotion|inducement|bonus|push notification|influencer/i },
  { key: "prop", label: "Prop / college bets", re: /\bprop\b|proposition (bet|wager)|college|collegiate|student[- ]athlete|ncaa|amateur/i },
  { key: "sweeps", label: "Sweepstakes", re: /sweepstake|social casino|dual[- ]currency|skill game|gray market/i },
  { key: "licensing", label: "Licensing", re: /licens|permit|operator|vendor|supplier|registration|fee/i },
  { key: "legalize", label: "Legalization / mobile", re: /authoriz|legaliz|mobile|online|internet|interactive|establish(es|ing)? .*wager|sports wagering act/i },
  { key: "integrity", label: "Consumer / integrity", re: /self[- ]exclusion|problem gambling|responsible|addiction|minor|age verification|integrity|limit/i },
];
const issuesOf = (b) => ISSUES.filter((i) => i.re.test(`${b.title} ${b.description || ""}`)).map((i) => i.key);

const Analysis = z.object({
  summary: z.string().describe("Two or three plain-English sentences on what the bill does, written for a regulatory lawyer. No preamble."),
  mechanics: z.array(z.string()).describe("Three to six key provisions as short bullets: rates, thresholds, definitions, who is covered, effective dates, enforcement."),
  issue_tags: z.array(z.enum(["tax", "prediction", "advertising", "prop", "sweeps", "licensing", "legalize", "integrity"])).describe("Issues the bill substantively addresses, judged from the text, not the title."),
  relevance: z.enum(["core", "partial", "incidental"]).describe("core: the bill is about sports betting or gaming. partial: a meaningful section is. incidental: it mentions wagering in passing, e.g. a budget line."),
  comparison: z.string().describe("Two to four sentences on how this bill differs from the other states' bills listed, naming the states and bill numbers. If nothing comparable is listed, say what is unusual about this bill on its own."),
  watch: z.string().describe("One sentence on what a lawyer representing sports-betting operators should watch for in this bill."),
});

const client = new Anthropic();

async function main() {
  const data = JSON.parse(await readFile("data/bills.json", "utf8"));
  const bills = Object.fromEntries(data.bills.map((b) => [b.id, b]));
  const files = (await readdir("data/texts")).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  const texts = [];
  for (const f of files) texts.push(JSON.parse(await readFile(`data/texts/${f}`, "utf8")));
  let analysis = {};
  try { analysis = JSON.parse(await readFile("data/analysis.json", "utf8")); } catch {}

  const onlyTopics = process.env.TOPIC ? process.env.TOPIC.split(",") : null; // e.g. TOPIC=sports,igaming to limit spend
  const todo = texts.filter((t) => bills[t.id] && !analysis[t.id] && (t.text?.length > 400 || t.abstract) && (!onlyTopics || bills[t.id].topics.some((x) => onlyTopics.includes(x))))
    .sort((a, b) => (bills[a.id].topics.includes("sports") ? 0 : 1) - (bills[b.id].topics.includes("sports") ? 0 : 1)); // sports first
  console.error(`${todo.length} bills to analyse (${Object.keys(analysis).length} already done)`);

  // Peer list: other moved bills sharing an issue tag, as title lines, so Claude can compare across states.
  function peers(t) {
    const b = bills[t.id];
    const mine = new Set(issuesOf(b));
    const topic = b.topics[0];
    return texts
      .filter((o) => o.id !== t.id && bills[o.id] && o.state !== t.state && bills[o.id].topics.includes(topic) && (topic !== "sports" || issuesOf(bills[o.id]).some((k) => mine.has(k))))
      .slice(0, 40)
      .map((o) => `${o.state} ${o.number} — ${bills[o.id].title}${o.abstract ? ` — ${o.abstract.slice(0, 300)}` : ""}`)
      .join("\n");
  }

  let i = 0, spent = { in: 0, out: 0 };
  async function worker() {
    while (i < todo.length) {
      const t = todo[i++];
      const b = bills[t.id];
      const body = t.text?.length > 400 ? t.text.slice(0, MAX_TEXT) : `(Full text unavailable. Official abstract:) ${t.abstract}`;
      try {
        const res = await client.messages.parse({
          model: MODEL,
          max_tokens: 4000,
          system: b.topics.some((t) => ["sports", "igaming", "cards"].includes(t))
            ? "You analyse state legislation for a lawyer who represents sports-betting operators, online casino (iGaming) operators, and collectibles and trading-card companies (including live card breaks and mystery packs). Be precise, cite section numbers or figures from the text when they matter, and never invent provisions that are not in the text. Write in plain English, no headings, no markdown."
            : "You analyse state legislation for a lawyer who represents technology companies and an industry coalition opposing burdensome state AI regulation. Be precise about who is covered (developers, deployers, size thresholds), obligations, penalties, private rights of action, preemption and effective dates; cite section numbers when they matter; never invent provisions. Write in plain English, no headings, no markdown. For issue_tags, use: licensing for registration/audit/impact-assessment duties, integrity for consumer-protection/transparency/disclosure duties, advertising for deepfake/synthetic-media rules, prop for employment/automated-decision rules, tax for any fee or tax, legalize for government-use or sandbox/innovation provisions, prediction for frontier/safety/catastrophic-risk rules, sweeps for chatbot/companion/minor-protection rules.",
          messages: [{
            role: "user",
            content: `Bill: ${b.state} ${b.number} — ${b.title}\nStatus: ${b.status_text}. Last action ${b.last_action_date}: ${b.last_action}\n\nOther states' bills on overlapping issues:\n${peers(t) || "(none)"}\n\nBill text (${t.version?.note || "current version"}):\n${body}`,
          }],
          output_config: { format: zodOutputFormat(Analysis) },
        });
        if (!res.parsed_output) throw new Error("no parsed output (" + res.stop_reason + ")");
        analysis[t.id] = { ...res.parsed_output, model: MODEL, version: t.version?.note || null, text_chars: t.text_chars, generated: new Date().toISOString() };
        spent.in += res.usage.input_tokens; spent.out += res.usage.output_tokens;
        console.error(`  ${b.state} ${b.number} ✓  (${res.usage.input_tokens} in / ${res.usage.output_tokens} out)`);
        await writeFile("data/analysis.json", JSON.stringify(analysis, null, 1));
      } catch (e) {
        console.error(`  ${b.state} ${b.number} ✗ ${e.message}`);
        if (/credit balance/i.test(e.message)) { i = todo.length; }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await writeFile("data/analysis.js", `window.STATECRAFT_ANALYSIS = ${JSON.stringify(analysis)};\n`);
  const cost = (spent.in * 4 + spent.out * 20) / 1e6;
  console.error(`Done. ${Object.keys(analysis).length} analysed. This run: ${spent.in} in / ${spent.out} out tokens ≈ $${cost.toFixed(2)}.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
