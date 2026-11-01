// Pulls current sports-betting bills for all 50 states from LegiScan and
// writes a static snapshot to data/bills.js for the app to load offline.
//
// Usage:  LEGISCAN_KEY=xxxx node scripts/fetch_bills.mjs
//
// LegiScan aggregates each state legislature's own bill feed; every bill we
// store links back to its page on the official state site (state_link).

import { writeFile, mkdir } from "node:fs/promises";

const KEY = process.env.LEGISCAN_KEY;
if (!KEY) {
  console.error("Set LEGISCAN_KEY in the environment.");
  process.exit(1);
}

const QUERIES = ['"sports betting"', '"sports wagering"', '"sports gambling"', '"sportsbook"'];
const TOPIC = "Sports betting";
const CONCURRENCY = 6;

const STATUS_TEXT = {
  0: "Prefiled",
  1: "Introduced",
  2: "Passed one chamber",
  3: "Passed both chambers",
  4: "Signed into law",
  5: "Vetoed",
  6: "Failed / Dead",
};

async function api(op, params = {}) {
  const url = new URL("https://api.legiscan.com/");
  url.searchParams.set("key", KEY);
  url.searchParams.set("op", op);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    const json = await res.json();
    if (json.status !== "OK") throw new Error(`${op}: ${json.alert?.message || JSON.stringify(json)}`);
    return json;
  }
  throw new Error(`${op}: gave up after retries`);
}

// getSearch returns 50 results per page; walk every page for every query.
async function search(query) {
  const found = new Map();
  let page = 1;
  let total = 1;
  do {
    const json = await api("getSearch", { state: "ALL", query, year: 2, page });
    const sr = json.searchresult;
    total = sr.summary?.page_total ?? 1;
    for (const [k, v] of Object.entries(sr)) {
      if (k === "summary") continue;
      found.set(v.bill_id, v);
    }
    console.error(`  ${query} page ${page}/${total}: ${found.size} so far`);
    page++;
  } while (page <= total);
  return found;
}

function chamberFromNumber(number) {
  const n = number.toUpperCase();
  if (/^(H|A|AB|HB|HR|HJR|HCR|HF|HJ|AJR|ACR|LB)/.test(n)) return "H";
  if (/^(S|SB|SR|SJR|SCR|SF|SJ)/.test(n)) return "S";
  return "O";
}

async function main() {
  const all = new Map();
  for (const q of QUERIES) {
    const hits = await search(q);
    for (const [id, v] of hits) if (!all.has(id)) all.set(id, v);
  }
  console.error(`Total unique bills: ${all.size}`);

  const ids = [...all.keys()];
  const bills = [];
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        const { bill } = await api("getBill", { id });
        const hits = all.get(id);
        bills.push({
          id: bill.bill_id,
          state: bill.state,
          number: bill.bill_number,
          chamber: chamberFromNumber(bill.bill_number),
          title: bill.title,
          description: bill.description,
          status: bill.status,
          status_text: STATUS_TEXT[bill.status] ?? "Unknown",
          status_date: bill.status_date,
          last_action: bill.history?.at(-1)?.action ?? "",
          last_action_date: bill.history?.at(-1)?.date ?? "",
          session: bill.session?.session_name ?? "",
          url: bill.state_link,
          legiscan_url: bill.url,
          relevance: hits?.relevance ?? 0,
          sponsors: (bill.sponsors ?? []).slice(0, 4).map((s) => s.name),
          hearings: (bill.calendar ?? []).map((c) => ({
            date: c.date,
            time: c.time,
            location: c.location,
            description: c.description,
          })),
          history: (bill.history ?? []).slice(-5).map((h) => ({ date: h.date, action: h.action, chamber: h.chamber })),
        });
        if (bills.length % 25 === 0) console.error(`  fetched ${bills.length}/${ids.length}`);
      } catch (e) {
        console.error(`  skip ${id}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  bills.sort((a, b) => a.state.localeCompare(b.state) || a.number.localeCompare(b.number));
  const out = {
    generated: new Date().toISOString(),
    topic: TOPIC,
    source: "State legislatures via LegiScan API",
    queries: QUERIES,
    bills,
  };
  await mkdir("data", { recursive: true });
  await writeFile("data/bills.js", `window.STATECRAFT_DATA = ${JSON.stringify(out)};\n`);
  await writeFile("data/bills.json", JSON.stringify(out, null, 1));
  console.error(`Wrote data/bills.js with ${bills.length} bills.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
