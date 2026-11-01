// Fallback data source: Open States v3 API (openstates.org). Same output
// format as fetch_bills.mjs so the app does not care which one produced it.
//
// Usage:  OPENSTATES_KEY=xxxx node scripts/fetch_bills_openstates.mjs

import { writeFile, mkdir } from "node:fs/promises";

const KEY = process.env.OPENSTATES_KEY;
if (!KEY) {
  console.error("Set OPENSTATES_KEY in the environment.");
  process.exit(1);
}

const QUERIES = ["sports betting", "sports wagering", "sportsbook"];
const TOPIC = "Sports betting";
const JUR_TO_STATE = {}; // filled from jurisdiction names
const NAME_TO_ST = {
  Alabama:"AL",Alaska:"AK",Arizona:"AZ",Arkansas:"AR",California:"CA",Colorado:"CO",Connecticut:"CT",Delaware:"DE",
  "District of Columbia":"DC",Florida:"FL",Georgia:"GA",Hawaii:"HI",Idaho:"ID",Illinois:"IL",Indiana:"IN",Iowa:"IA",
  Kansas:"KS",Kentucky:"KY",Louisiana:"LA",Maine:"ME",Maryland:"MD",Massachusetts:"MA",Michigan:"MI",Minnesota:"MN",
  Mississippi:"MS",Missouri:"MO",Montana:"MT",Nebraska:"NE",Nevada:"NV","New Hampshire":"NH","New Jersey":"NJ",
  "New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND",Ohio:"OH",Oklahoma:"OK",Oregon:"OR",
  Pennsylvania:"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD",Tennessee:"TN",Texas:"TX",Utah:"UT",
  Vermont:"VT",Virginia:"VA",Washington:"WA","West Virginia":"WV",Wisconsin:"WI",Wyoming:"WY"
};

async function api(path, params) {
  const url = new URL("https://v3.openstates.org" + path);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(url, { headers: { "X-API-KEY": KEY } });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 15000 * (attempt + 1);
      console.error(`  429, waiting ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  }
  throw new Error(`${path}: rate limited`);
}

// Derive a LegiScan-style status code from Open States action classifications.
function statusFrom(actions) {
  const cls = new Set(actions.flatMap((a) => a.classification || []));
  if (cls.has("executive-signature") || cls.has("became-law")) return 4;
  if (cls.has("executive-veto")) return 5;
  if (cls.has("failure") || cls.has("withdrawal")) return 6;
  const passages = actions.filter((a) => (a.classification || []).includes("passage"));
  const chambers = new Set(passages.map((a) => a.organization?.classification));
  if (chambers.size >= 2) return 3;
  if (passages.length) return 2;
  return 1;
}
const STATUS_TEXT = { 1: "Introduced", 2: "Passed one chamber", 3: "Passed both chambers", 4: "Signed into law", 5: "Vetoed", 6: "Failed / Dead" };

async function main() {
  const all = new Map();
  for (const q of QUERIES) {
    let page = 1, max = 1;
    do {
      const json = await api("/bills", {
        q, sort: "updated_desc", per_page: 20, page,
        include: ["actions", "sponsorships", "sources", "abstracts"],
        created_since: "2025-01-01",
      });
      max = json.pagination.max_page;
      for (const b of json.results) all.set(b.id, b);
      console.error(`  "${q}" page ${page}/${max}: ${all.size} so far`);
      page++;
      await new Promise((r) => setTimeout(r, 1100));
    } while (page <= max);
  }

  const bills = [];
  for (const b of all.values()) {
    const st = NAME_TO_ST[b.jurisdiction?.name];
    if (!st) continue;
    const actions = (b.actions || []).slice().sort((x, y) => x.date.localeCompare(y.date));
    const last = actions.at(-1);
    const status = statusFrom(actions);
    const chamberCls = b.from_organization?.classification;
    bills.push({
      id: b.id,
      state: st,
      number: b.identifier,
      chamber: st === "NE" ? "O" : chamberCls === "lower" ? "H" : chamberCls === "upper" ? "S" : "O",
      title: b.title,
      description: b.abstracts?.[0]?.abstract ?? "",
      status,
      status_text: STATUS_TEXT[status],
      status_date: last?.date?.slice(0, 10) ?? "",
      last_action: last?.description ?? b.latest_action_description ?? "",
      last_action_date: (last?.date ?? b.latest_action_date ?? "").slice(0, 10),
      session: b.session ?? "",
      url: b.sources?.[0]?.url ?? b.openstates_url,
      legiscan_url: b.openstates_url,
      relevance: 0,
      sponsors: (b.sponsorships || []).slice(0, 4).map((s) => s.name),
      hearings: [],
      history: actions.slice(-5).map((a) => ({ date: a.date.slice(0, 10), action: a.description, chamber: a.organization?.classification })),
    });
  }
  bills.sort((a, b) => a.state.localeCompare(b.state) || a.number.localeCompare(b.number));
  const out = { generated: new Date().toISOString(), topic: TOPIC, source: "State legislatures via Open States API", queries: QUERIES, bills };
  await mkdir("data", { recursive: true });
  await writeFile("data/bills.js", `window.STATECRAFT_DATA = ${JSON.stringify(out)};\n`);
  await writeFile("data/bills.json", JSON.stringify(out, null, 1));
  console.error(`Wrote data/bills.js with ${bills.length} bills.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
