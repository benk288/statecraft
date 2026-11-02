// Sponsor research from LegiScan: for every primary sponsor of a moved bill,
// how many bills they sponsored this session and how many passed a chamber or
// were enacted, computed from the state's master list. Writes data/sponsors.js.
//
// Usage:  LEGISCAN_KEY=xxxx node scripts/fetch_sponsor_stats.mjs

import { readFile, writeFile } from "node:fs/promises";
import { inScope as moved } from "./movement.mjs";

const KEY = process.env.LEGISCAN_KEY;
if (!KEY) { console.error("Set LEGISCAN_KEY."); process.exit(1); }

async function api(op, params = {}) {
  const url = new URL("https://api.legiscan.com/");
  url.searchParams.set("key", KEY); url.searchParams.set("op", op);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    const json = await res.json();
    if (json.status !== "OK") throw new Error(`${op}: ${json.alert?.message}`);
    return json;
  }
  throw new Error(`${op}: gave up`);
}

async function main() {
  const data = JSON.parse(await readFile("data/bills.json", "utf8"));
  const people = new Map();
  for (const b of data.bills.filter(moved)) for (const s of b.sponsors) {
    if (!s.primary) continue;
    const p = people.get(s.people_id) || { ...s, state: b.state, session_id: b.session_id, bills_here: [] };
    p.bills_here.push(b.id); people.set(s.people_id, p);
  }
  let sponsors = {};
  try { sponsors = JSON.parse(await readFile("data/sponsors.json", "utf8")); } catch {}
  const todo = [...people.values()].filter((p) => !sponsors[p.people_id]);
  console.error(`${todo.length} primary sponsors to research (${Object.keys(sponsors).length} done)`);

  // One master list per state: status of every bill in the current session.
  const master = {};
  for (const st of new Set(todo.map((p) => p.state))) {
    const m = (await api("getMasterList", { state: st })).masterlist;
    master[st] = { session_id: m.session?.session_id, bills: Object.fromEntries(Object.entries(m).filter(([k]) => k !== "session").map(([, v]) => [v.bill_id, v])) };
    console.error(`  ${st} master list: ${Object.keys(master[st].bills).length} bills`);
  }
  for (const p of todo) {
    try {
      const { sponsoredbills: sb } = await api("getSponsoredList", { id: p.people_id });
      const m = master[p.state];
      const mine = sb.bills.filter((x) => x.session_id === m.session_id).map((x) => m.bills[x.bill_id]).filter(Boolean);
      const bio = sb.sponsor?.bio ?? {};
      sponsors[p.people_id] = {
        people_id: p.people_id, name: sb.sponsor?.name ?? p.name, party: p.party, role: p.role, district: p.district, state: p.state,
        bills_total: mine.length, passed_chamber: mine.filter((x) => x.status >= 2 && x.status <= 4).length, enacted: mine.filter((x) => x.status === 4).length,
        sample: mine.filter((x) => x.status >= 2).slice(0, 4).map((x) => `${x.number}: ${x.title.slice(0, 80)}`),
        links: { ballotpedia: bio.social?.ballotpedia || (p.ballotpedia ? `https://ballotpedia.org/${p.ballotpedia}` : null), votesmart: bio.social?.votesmart || null, official: bio.social?.biography || bio.links?.official?.website || null, email: bio.social?.email || null, capitol_phone: bio.social?.capitol_phone || null, image: bio.social?.image || null, ftm_eid: sb.sponsor?.ftm_eid || null, opensecrets_id: sb.sponsor?.opensecrets_id || null },
        bills_here: p.bills_here,
      };
      console.error(`  ${p.state} ${sponsors[p.people_id].name}: ${mine.length} sponsored, ${sponsors[p.people_id].passed_chamber} passed a chamber, ${sponsors[p.people_id].enacted} enacted`);
      await writeFile("data/sponsors.json", JSON.stringify(sponsors, null, 1));
    } catch (e) { console.error(`  skip ${p.name}: ${e.message}`); }
  }
  await writeFile("data/sponsors.js", `window.STATECRAFT_SPONSORS = ${JSON.stringify(sponsors)};\n`);
  console.error(`Done: ${Object.keys(sponsors).length} sponsors.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
