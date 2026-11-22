// Incremental refresh: ask LegiScan for each tracked state's master list of
// change hashes, re-fetch only the bills whose hash moved, pick up newly
// matching bills via the topic searches, then fetch texts and run the sports
// summariser for anything new that has moved. Typical cost: a few dozen
// requests, versus ~3,000 for a full pull.
//
// Usage:  LEGISCAN_KEY=xxxx ANTHROPIC_API_KEY=sk-ant-... node scripts/refresh.mjs
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { TOPICS, billKey } from "./fetch_legiscan.mjs";

const KEY = process.env.LEGISCAN_KEY;
if (!KEY) { console.error("Set LEGISCAN_KEY."); process.exit(1); }
const STATUS_TEXT = { 0: "Prefiled", 1: "Introduced", 2: "Passed one chamber", 3: "Passed both chambers", 4: "Signed into law", 5: "Vetoed", 6: "Failed / Dead" };
let requests = 0;
async function api(op, params = {}) {
  const url = new URL("https://api.legiscan.com/"); url.searchParams.set("key", KEY); url.searchParams.set("op", op);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  requests++;
  const json = await (await fetch(url)).json();
  if (json.status !== "OK") throw new Error(`${op}: ${json.alert?.message}`);
  return json;
}
const chamberOf = (body) => ({ H: "H", A: "H", S: "S" }[body] ?? "O");
function shape(b, topics, relevance) {
  const hist = b.history ?? [], latestText = (b.texts ?? []).slice().sort((x, y) => (x.date || "").localeCompare(y.date || "")).at(-1) ?? null;
  return { id: billKey(b.state, b.bill_number), legiscan_id: b.bill_id, change_hash: b.change_hash, topics, relevance, state: b.state, number: b.bill_number, chamber: chamberOf(b.body), current_body: b.current_body,
    title: b.title, description: b.description, status: b.status, status_text: STATUS_TEXT[b.status] ?? "Unknown", status_date: b.status_date,
    last_action: hist.at(-1)?.action ?? "", last_action_date: hist.at(-1)?.date ?? "", history: hist.slice(-8).map((h) => ({ date: h.date, action: h.action, chamber: h.chamber })),
    progress: (b.progress ?? []).map((p) => ({ date: p.date, event: p.event })), calendar: (b.calendar ?? []).map((c) => ({ type: c.type, date: c.date, time: c.time, location: c.location, description: c.description })),
    committee: b.committee?.name ?? null, sponsors: (b.sponsors ?? []).map((s) => ({ people_id: s.people_id, name: s.name, party: s.party, role: s.role, district: s.district, primary: s.sponsor_type_id === 1, ballotpedia: s.ballotpedia || null, opensecrets_id: s.opensecrets_id || null, votesmart_id: s.votesmart_id || null })),
    text: latestText ? { doc_id: latestText.doc_id, date: latestText.date, type: latestText.type, mime: latestText.mime } : null,
    session: b.session?.session_name ?? "", session_id: b.session?.session_id, sine_die: !!b.session?.sine_die, url: b.state_link, legiscan_url: b.url };
}
async function main() {
  const data = JSON.parse(await readFile("data/bills.json", "utf8"));
  const byLid = new Map(data.bills.map((b) => [b.legiscan_id, b]));
  // 1. Changed bills, via per-state master lists of change hashes (one request per state).
  const changed = new Set();
  // STATES=CA,NJ,... limits the refresh to those states (e.g. only sessions that are alive); YEARS adds exact-year searches such as 2027 prefiles.
  const ONLY_STATES = process.env.STATES ? new Set(process.env.STATES.split(",")) : null;
  const YEARS = (process.env.YEARS || "2").split(",").map(Number);
  for (const st of new Set(data.bills.map((b) => b.state))) {
    if (ONLY_STATES && !ONLY_STATES.has(st)) continue;
    const m = (await api("getMasterListRaw", { state: st })).masterlist;
    for (const [k, v] of Object.entries(m)) { if (k === "session") continue; const mine = byLid.get(v.bill_id); if (mine && mine.change_hash !== v.change_hash) changed.add(v.bill_id); }
  }
  console.error(`${changed.size} tracked bills changed`);
  // 2. New bills matching the topic searches (relevance from search), limited to the first page of each query.
  const fresh = new Map();
  const onlyTopics = process.env.ONLY_TOPICS ? process.env.ONLY_TOPICS.split(",") : null;
  for (const [tkey, t] of Object.entries(TOPICS)) { if (onlyTopics && !onlyTopics.includes(tkey)) continue; for (const q of t.queries) for (const year of YEARS) {
    let page = 1, total = 1;
    do { // "current" (2) only needs its first page; an exact year such as 2027 is read in full
      const sr = (await api("getSearch", { state: "ALL", query: q, year, page })).searchresult;
      total = year > 1900 ? (sr.summary?.page_total ?? 1) : 1;
      for (const [k, v] of Object.entries(sr)) if (k !== "summary" && !byLid.has(v.bill_id) && (!ONLY_STATES || ONLY_STATES.has(v.state))) { const f = fresh.get(v.bill_id) || { topics: new Set(), relevance: 0 }; f.topics.add(tkey); f.relevance = Math.max(f.relevance, v.relevance); fresh.set(v.bill_id, f); }
      page++;
    } while (page <= total);
  } }
  console.error(`${fresh.size} new bills (${requests} requests so far)`);
  if (process.env.DRY) { const by = {}; for (const id of fresh.keys()) by[id] = 1; console.error("Dry run: stopping before fetching bills."); return; }
  // 3. Re-fetch those bills.
  const ids = [...changed, ...fresh.keys()];
  for (const id of ids) {
    try {
      const { bill } = await api("getBill", { id });
      if (bill.state === "US") continue;
      const prev = byLid.get(id), meta = prev ? { topics: prev.topics, relevance: prev.relevance } : { topics: [...fresh.get(id).topics], relevance: fresh.get(id).relevance };
      const rec = shape(bill, meta.topics, meta.relevance);
      const i = data.bills.findIndex((b) => b.legiscan_id === id);
      i >= 0 ? (data.bills[i] = rec) : data.bills.push(rec);
    } catch (e) { console.error(`  skip ${id}: ${e.message}`); }
  }
  data.bills.sort((a, b) => a.state.localeCompare(b.state) || a.number.localeCompare(b.number));
  data.generated = new Date().toISOString();
  await writeFile("data/bills.js", `window.STATECRAFT_DATA = ${JSON.stringify(data)};\n`);
  await writeFile("data/bills.json", JSON.stringify(data, null, 1));
  console.error(`Snapshot updated: ${data.bills.length} bills, ${requests} LegiScan requests so far.`);
  spawnSync("node", ["scripts/fix_ids.mjs"], { stdio: "inherit" }); // keep ids unique across sessions
  spawnSync("node", ["scripts/fetch_sessions.mjs"], { stdio: "inherit" }); // which sessions are still alive
  if (process.env.SKIP_ENRICH) return;
  // 4. Texts, sponsor stats, text bundle, and sports summaries for anything new that moved (each script skips what it already has).
  const run = (script, env = {}) => { const r = spawnSync("node", [script], { stdio: "inherit", env: { ...process.env, ...env } }); if (r.status) console.error(`${script} exited ${r.status}`); };
  run("scripts/fetch_legiscan_texts.mjs");
  run("scripts/fetch_sponsor_stats.mjs");
  run("scripts/build_texts.mjs");
  if (process.env.ANTHROPIC_API_KEY) run("scripts/summarize.mjs", { TOPIC: process.env.TOPIC || "sports" }); else console.error("ANTHROPIC_API_KEY not set; skipping summaries.");
  spawnSync("sh", ["scripts/build_dist.sh"], { stdio: "inherit" });
}
main().catch((e) => { console.error(e); process.exit(1); });
