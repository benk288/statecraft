// Sponsor money research. No structured API covers state legislators' donors
// since FollowTheMoney closed, so Claude researches each primary sponsor with
// web search (OpenSecrets, state disclosure portals, Ballotpedia) and records
// what it finds with source links. Results are labelled as AI-researched in the app.
//
// Usage:  ANTHROPIC_API_KEY=sk-ant-... [LIMIT=10] [TOPICS=sports,igaming,cards] node scripts/sponsor_money.mjs
import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import { moved } from "./movement.mjs";

const client = new Anthropic();
const TOPICS = (process.env.TOPICS || "sports,igaming,cards").split(",");
const LIMIT = Number(process.env.LIMIT || 0);
const NAMES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};

const data = JSON.parse(await readFile("data/bills.json", "utf8"));
const sponsors = JSON.parse(await readFile("data/sponsors.json", "utf8"));
// Primary sponsors of moved bills in the chosen topics, furthest-along bills first.
const order = [];
for (const b of data.bills.filter((b) => moved(b) && b.topics.some((t) => TOPICS.includes(t))).sort((a, b) => b.status - a.status)) for (const s of b.sponsors.filter((s) => s.primary && (s.party || s.district))) if (sponsors[s.people_id] && !order.includes(s.people_id)) order.push(s.people_id); // committees have no party/district
const todo = order.filter((id) => !sponsors[id].money).slice(0, LIMIT || undefined);
console.error(`${todo.length} sponsors to research (${order.filter((id) => sponsors[id].money).length} done)`);

let i = 0, cost = 0;
async function worker() {
  while (i < todo.length) {
    const id = todo[i++], s = sponsors[id];
    try {
      const res = await client.messages.create({
        model: "claude-opus-5-5", max_tokens: 4000, output_config: { effort: "medium" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
        system: "You research campaign finance for state legislators for a regulatory law practice. Use OpenSecrets (which now hosts the former FollowTheMoney state data), the state's campaign-finance disclosure portal, Ballotpedia, and reputable press. Report only figures you actually found, with the source URL for each; never estimate or invent amounts. Finish with one JSON object in a ```json code block.",
        messages: [{ role: "user", content: `Legislator: ${s.name}, ${s.party || "party unknown"}, ${s.role || ""} ${s.district || ""}, ${NAMES[s.state] || s.state}.\nFind: total raised in the most recent election cycle you can document; the top contributors by amount (up to 6, name, amount, and whether individual, PAC, party, or self-funding); top contributing industries if available; and whether gaming, sports betting, casino, lottery, or technology/AI interests appear among contributors.\nReturn JSON with keys: total_raised (number or null), cycle (string), top_contributors (array of {name, amount, type}), industries (array of {name, amount}), gaming_or_tech (string, one sentence or empty), sources (array of URLs), as_of (today's date), confidence ("high"|"medium"|"low"), note (one sentence on data limits).` }],
      });
      const text = res.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
      const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})\s*$/);
      if (!m) throw new Error("no JSON in answer");
      const money = JSON.parse(m[1]);
      money.researched = new Date().toISOString().slice(0, 10);
      s.money = money;
      const searches = res.usage.server_tool_use?.web_search_requests || 0;
      cost += (res.usage.input_tokens * 4 + res.usage.output_tokens * 20) / 1e6 + searches * 0.01;
      console.error(`  ${s.state} ${s.name}: ${money.total_raised ? "$" + Math.round(money.total_raised).toLocaleString() : "no total"} · ${(money.top_contributors || []).length} contributors · ${searches} searches · running ≈ $${cost.toFixed(2)}`);
      await writeFile("data/sponsors.json", JSON.stringify(sponsors, null, 1));
    } catch (e) { console.error(`  ${s.name}: ${e.message}`); if (/credit balance/i.test(e.message)) i = todo.length; }
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
await writeFile("data/sponsors.js", `window.STATECRAFT_SPONSORS = ${JSON.stringify(sponsors)};\n`);
console.error(`Done. ${Object.values(sponsors).filter((s) => s.money).length} sponsors have money data. This run ≈ $${cost.toFixed(2)}.`);
