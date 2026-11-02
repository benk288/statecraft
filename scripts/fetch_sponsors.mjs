// Phase 2b: sponsor research from legislative records. For every primary
// sponsor of a moved bill, count the bills they carried this session and how
// many passed a chamber or became law. Writes data/sponsors.js.
//
// Usage:  OPENSTATES_KEY=xxxx node scripts/fetch_sponsors.mjs

import { readFile, readdir, writeFile } from "node:fs/promises";

const KEY = process.env.OPENSTATES_KEY;
if (!KEY) { console.error("Set OPENSTATES_KEY."); process.exit(1); }
const MAX_PAGES = 3; // 20 bills per page; "60+" beyond that

async function api(path, params = {}) {
  const url = new URL("https://v3.openstates.org" + path);
  for (const [k, v] of Object.entries(params)) Array.isArray(v) ? v.forEach((x) => url.searchParams.append(k, x)) : url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url, { headers: { "X-API-KEY": KEY } });
    if (res.status === 429) { const w = Number(res.headers.get("retry-after")) * 1000 || 15000 * (attempt + 1); console.error(`  429, waiting ${w / 1000}s`); await new Promise((r) => setTimeout(r, w)); continue; }
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }
  throw new Error(`${path}: rate limited`);
}

const NAME_TO_JUR = {};
async function main() {
  const data = JSON.parse(await readFile("data/bills.json", "utf8"));
  const sessionOf = Object.fromEntries(data.bills.map((b) => [b.id, b.session]));
  const files = (await readdir("data/texts")).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  const people = new Map();
  for (const f of files) {
    const t = JSON.parse(await readFile(`data/texts/${f}`, "utf8"));
    for (const s of t.sponsors) {
      if (!s.person_id || !s.primary) continue;
      if (!people.has(s.person_id)) people.set(s.person_id, { ...s, state: t.state, session: sessionOf[t.id], bills_here: [] });
      people.get(s.person_id).bills_here.push(`${t.state} ${t.number}`);
    }
  }
  let sponsors = {};
  try { sponsors = JSON.parse(await readFile("data/sponsors.json", "utf8")); } catch {}
  const todo = [...people.values()].filter((p) => !sponsors[p.person_id]);
  console.error(`${todo.length} primary sponsors to research (${Object.keys(sponsors).length} done)`);

  for (const p of todo) {
    try {
      let page = 1, max = 1, total = 0, passed = 0, enacted = 0, sample = [];
      do {
        const json = await api("/bills", { sponsor: p.person_id, session: p.session, jurisdiction: p.state.toLowerCase(), per_page: 20, page, include: ["actions"], sort: "updated_desc" });
        max = json.pagination.max_page; total = json.pagination.total_items;
        for (const b of json.results) {
          const cls = new Set((b.actions || []).flatMap((a) => a.classification || []));
          if (cls.has("passage")) passed++;
          if (cls.has("executive-signature") || cls.has("became-law")) enacted++;
          if (sample.length < 5) sample.push(`${b.identifier}: ${b.title.slice(0, 90)}`);
        }
        page++;
        await new Promise((r) => setTimeout(r, 1100));
      } while (page <= Math.min(max, MAX_PAGES));
      const counted = Math.min(total, MAX_PAGES * 20);
      sponsors[p.person_id] = {
        name: p.name, party: p.party, title: p.title, district: p.district, chamber: p.chamber, state: p.state, session: p.session,
        bills_total: total, bills_counted: counted, passed_chamber: passed, enacted, sample,
        openstates_url: `https://openstates.org/person/${p.person_id.replace("ocd-person/", "")}/`,
        bills_here: p.bills_here,
      };
      console.error(`  ${p.state} ${p.name}: ${total} bills, ${passed} passed a chamber, ${enacted} enacted`);
      await writeFile("data/sponsors.json", JSON.stringify(sponsors, null, 1));
    } catch (e) {
      console.error(`  skip ${p.name}: ${e.message}`);
    }
  }
  await writeFile("data/sponsors.js", `window.STATECRAFT_SPONSORS = ${JSON.stringify(sponsors)};\n`);
  console.error(`Done: ${Object.keys(sponsors).length} sponsors.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
