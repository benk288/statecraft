// Primary data pull from LegiScan: current-session bills for each tracked
// topic, with status, history, calendar (hearings / floor), sponsors with
// external IDs, and the latest text document id. Writes data/bills.js.
//
// Usage:  LEGISCAN_KEY=xxxx node scripts/fetch_legiscan.mjs
// Bills are keyed "ST-NUMBER" (e.g. NY-A8361) so analysis and texts survive refreshes.

import { writeFile, mkdir, readFile } from "node:fs/promises";

const KEY = process.env.LEGISCAN_KEY;
if (!KEY) { console.error("Set LEGISCAN_KEY."); process.exit(1); }

export const TOPICS = {
  sports: { label: "Sports betting", queries: ['"sports betting"', '"sports wagering"', '"prediction market"', '"sweepstakes" AND casino', '"event contract"', '"daily fantasy"'] },
  ai: { label: "AI regulation", queries: ['"artificial intelligence"', '"automated decision"', '"frontier model"', '"algorithmic discrimination"', '"generative artificial intelligence"', '"deepfake"'] },
  igaming: { label: "iGaming", queries: ['"internet gaming"', '"online casino"', '"igaming"', '"interactive gaming"', '"internet casino"'] },
  cards: { label: "Card breaks", queries: ['"trading card"', '"mystery pack"', '"loot box"', '"card break"', '"collectible" AND gambling', '"blind box"'] },
};
// ONLY_TOPICS=igaming,cards merges just those topics into the existing snapshot instead of re-pulling everything.
const ONLY = process.env.ONLY_TOPICS ? process.env.ONLY_TOPICS.split(",") : null;
const CONCURRENCY = 5;
const STATUS_TEXT = { 0: "Prefiled", 1: "Introduced", 2: "Passed one chamber", 3: "Passed both chambers", 4: "Signed into law", 5: "Vetoed", 6: "Failed / Dead" };
export const billKey = (state, number) => `${state}-${String(number).replace(/\s+/g, "").toUpperCase().replace(/^([A-Z]+)0+(\d)/, "$1$2")}`;

async function api(op, params = {}) {
  const url = new URL("https://api.legiscan.com/");
  url.searchParams.set("key", KEY); url.searchParams.set("op", op);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    const json = await res.json();
    if (json.status !== "OK") throw new Error(`${op}: ${json.alert?.message || JSON.stringify(json).slice(0, 200)}`);
    return json;
  }
  throw new Error(`${op}: gave up`);
}

async function search(query) {
  const found = new Map(); let page = 1, total = 1;
  do {
    const sr = (await api("getSearch", { state: "ALL", query, year: 2, page })).searchresult;
    total = sr.summary?.page_total ?? 1;
    for (const [k, v] of Object.entries(sr)) if (k !== "summary") found.set(v.bill_id, v);
    page++;
  } while (page <= total);
  return found;
}

const chamberOf = (body) => ({ H: "H", A: "H", S: "S" }[body] ?? "O");

async function main() {
  const hits = new Map(); // bill_id -> { topics:Set, relevance }
  let existing = [];
  if (ONLY) { try { existing = JSON.parse(await readFile("data/bills.json", "utf8")).bills; } catch {} }
  const existingByLid = new Map(existing.map((b) => [b.legiscan_id, b]));
  for (const [tkey, t] of Object.entries(TOPICS)) {
    if (ONLY && !ONLY.includes(tkey)) continue;
    for (const q of t.queries) {
      const f = await search(q);
      for (const [id, v] of f) {
        const h = hits.get(id) || { topics: new Set(), relevance: 0 };
        h.topics.add(tkey); h.relevance = Math.max(h.relevance, v.relevance); hits.set(id, h);
      }
      console.error(`  ${tkey} ${q}: ${f.size} (${hits.size} total)`);
    }
  }
  // In merge mode, bills we already hold just gain the new topic tag; only unknown bills are fetched.
  const bills = ONLY ? existing.map((b) => { const h = hits.get(b.legiscan_id); if (h) { b.topics = [...new Set([...b.topics, ...h.topics])]; b.relevance = Math.max(b.relevance, h.relevance); } return b; }) : [];
  const ids = [...hits.keys()].filter((id) => !existingByLid.has(id)); let i = 0;
  console.error(`${ids.length} bills to fetch${ONLY ? ` (${existing.length} kept)` : ""}`);
  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        const { bill: b } = await api("getBill", { id });
        if (b.state === "US") continue; // Congress is out of scope
        const hist = b.history ?? [];
        const latestText = (b.texts ?? []).slice().sort((x, y) => (x.date || "").localeCompare(y.date || "")).at(-1) ?? null;
        bills.push({
          id: billKey(b.state, b.bill_number), legiscan_id: b.bill_id, change_hash: b.change_hash,
          topics: [...hits.get(id).topics], relevance: hits.get(id).relevance,
          state: b.state, number: b.bill_number, chamber: chamberOf(b.body), current_body: b.current_body,
          title: b.title, description: b.description,
          status: b.status, status_text: STATUS_TEXT[b.status] ?? "Unknown", status_date: b.status_date,
          last_action: hist.at(-1)?.action ?? "", last_action_date: hist.at(-1)?.date ?? "",
          history: hist.slice(-8).map((h) => ({ date: h.date, action: h.action, chamber: h.chamber })),
          progress: (b.progress ?? []).map((p) => ({ date: p.date, event: p.event })),
          calendar: (b.calendar ?? []).map((c) => ({ type: c.type, date: c.date, time: c.time, location: c.location, description: c.description })),
          committee: b.committee?.name ?? null,
          sponsors: (b.sponsors ?? []).map((s) => ({ people_id: s.people_id, name: s.name, party: s.party, role: s.role, district: s.district, primary: s.sponsor_type_id === 1, ballotpedia: s.ballotpedia || null, opensecrets_id: s.opensecrets_id || null, votesmart_id: s.votesmart_id || null })),
          text: latestText ? { doc_id: latestText.doc_id, date: latestText.date, type: latestText.type, mime: latestText.mime } : null,
          session: b.session?.session_name ?? "", session_id: b.session?.session_id, sine_die: !!b.session?.sine_die,
          url: b.state_link, legiscan_url: b.url,
        });
        if (bills.length % 50 === 0) console.error(`  ${bills.length}/${ids.length} bills`);
      } catch (e) { console.error(`  skip ${id}: ${e.message}`); }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  bills.sort((a, b) => a.state.localeCompare(b.state) || a.number.localeCompare(b.number));
  const out = { generated: ONLY && existing.length ? JSON.parse(await readFile("data/bills.json", "utf8")).generated : new Date().toISOString(), source: "State legislatures via LegiScan API", topics: Object.fromEntries(Object.entries(TOPICS).map(([k, t]) => [k, t.label])), bills };
  await mkdir("data", { recursive: true });
  await writeFile("data/bills.js", `window.STATECRAFT_DATA = ${JSON.stringify(out)};\n`);
  await writeFile("data/bills.json", JSON.stringify(out, null, 1));
  const cal = bills.filter((b) => b.calendar.length).length;
  console.error(`Wrote ${bills.length} bills (${bills.filter((b) => b.topics.includes("sports")).length} sports, ${bills.filter((b) => b.topics.includes("ai")).length} AI); ${cal} have calendar entries.`);
}
if (process.argv[1] && process.argv[1].endsWith("fetch_legiscan.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
