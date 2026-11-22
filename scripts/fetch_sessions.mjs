// Which legislative sessions are actually alive. LegiScan says whether each
// session is prefiling, open, or adjourned sine die; Open States supplies the
// calendar dates, which catch sessions LegiScan has not yet flagged as closed.
// Writes data/sessions.json and data/sessions.js. Costs 1 LegiScan request.
//
// Usage:  LEGISCAN_KEY=xxxx OPENSTATES_KEY=xxxx node scripts/fetch_sessions.mjs
import { writeFile } from "node:fs/promises";

const LS = process.env.LEGISCAN_KEY, OS = process.env.OPENSTATES_KEY;
if (!LS) { console.error("Set LEGISCAN_KEY."); process.exit(1); }
const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, year = now.getFullYear(); // local date

const ls = await (await fetch(`https://api.legiscan.com/?key=${LS}&op=getSessionList`)).json();
if (ls.status !== "OK") throw new Error("getSessionList failed");

// Open States: per state, is any session's calendar window open today?
const meeting = {}; // ST -> { name, end } of the session covering today
if (OS) {
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`https://v3.openstates.org/jurisdictions?classification=state&include=legislative_sessions&per_page=52&page=${page}&apikey=${OS}`);
    if (!res.ok) { console.error(`Open States ${res.status}; using LegiScan flags only`); break; }
    const j = await res.json();
    for (const r of j.results) {
      const st = (r.id.match(/state:(\w\w)/) || r.id.match(/district:(\w\w)/) || [])[1]?.toUpperCase(); if (!st) continue;
      meeting[st] = meeting[st] || null;
      for (const s of r.legislative_sessions || []) if (s.start_date && s.start_date <= today && (!s.end_date || s.end_date >= today)) meeting[st] = { name: s.name, end: s.end_date || null, special: s.classification === "special" };
    }
    if (page >= j.pagination.max_page) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
}
const haveDates = Object.keys(meeting).length > 0;

const bySession = {}, prefileYear = {}, states = {};
for (const s of ls.sessions) {
  if (s.state_abbr === "US" || s.year_end < year - 1) continue;
  let status = s.prefile ? "prefile" : s.sine_die || s.prior ? "adjourned" : "live";
  // LegiScan leaves some closed sessions unflagged; trust the calendar when we have one.
  if (status === "live" && haveDates && s.state_abbr in meeting && !meeting[s.state_abbr]) status = "adjourned";
  bySession[s.session_id] = status;
  if (status === "prefile") prefileYear[s.session_id] = s.year_start;
  const st = (states[s.state_abbr] = states[s.state_abbr] || { status: "adjourned", sessions: [] });
  if (status !== "adjourned") st.sessions.push({ name: s.session_name, status, special: !!s.special });
  if (status === "live" || (status === "prefile" && st.status !== "live")) st.status = status;
}
for (const [st, m] of Object.entries(meeting)) if (m && states[st]) states[st].ends = m.end;

const out = { generated: new Date().toISOString(), today, source: "LegiScan getSessionList; Open States session calendars", bySession, prefileYear, states };
await writeFile("data/sessions.json", JSON.stringify(out, null, 1));
await writeFile("data/sessions.js", `window.STATECRAFT_SESSIONS = ${JSON.stringify(out)};\n`);
const list = (k) => Object.entries(states).filter(([, v]) => v.status === k).map(([s]) => s).sort().join(" ");
console.error(`In session: ${list("live")}\nPrefiling:  ${list("prefile")}\nAdjourned:  ${list("adjourned")}`);
