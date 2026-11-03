// One-off + reusable: make bill ids unique. Annual-session states restart bill numbers
// every year, so "AZ-SB1667" can name a 2025 bill and a 2026 bill. The bill that already
// carries data (present in data/bills.before-prior.json) keeps the plain id; the other gets
// "~<year>" appended. Safe to re-run.
import { readFile, writeFile } from "node:fs/promises";
const d = JSON.parse(await readFile("data/bills.json", "utf8"));
let keep = new Set();
try { keep = new Set(JSON.parse(await readFile("data/bills.before-prior.json", "utf8")).bills.map((b) => b.legiscan_id)); } catch {}
const groups = {};
for (const b of d.bills) (groups[b.id] ||= []).push(b);
let renamed = 0;
for (const [id, list] of Object.entries(groups)) {
  if (list.length < 2) continue;
  list.sort((a, b) => (keep.has(b.legiscan_id) ? 1 : 0) - (keep.has(a.legiscan_id) ? 1 : 0) || b.session_id - a.session_id);
  list.slice(1).forEach((b) => { const yr = (b.session.match(/\d{4}/) || [b.session_id])[0]; let nid = `${id}~${yr}`; if (list.some((x) => x.id === nid) ) nid = `${id}~${b.session_id}`; b.id = nid; renamed++; });
}
const still = Object.values(d.bills.reduce((m, b) => ((m[b.id] = (m[b.id] || 0) + 1), m), {})).filter((n) => n > 1).length;
await writeFile("data/bills.js", `window.STATECRAFT_DATA = ${JSON.stringify(d)};\n`);
await writeFile("data/bills.json", JSON.stringify(d, null, 1));
console.error(`Renamed ${renamed} bills; duplicate ids remaining: ${still}`);
