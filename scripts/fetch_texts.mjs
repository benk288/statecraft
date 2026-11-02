// Phase 2 data pull: for every bill that has moved beyond introduction, fetch
// its current text and its sponsor records from Open States, and write them to
// data/texts/<id>.json. The summariser and the model-bill comparison both read
// from that folder, so this only needs to run once per snapshot.
//
// Usage:  OPENSTATES_KEY=xxxx node scripts/fetch_texts.mjs

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const KEY = process.env.OPENSTATES_KEY;
if (!KEY) { console.error("Set OPENSTATES_KEY."); process.exit(1); }

const MOVED_RE = /third reading|floor|conference|concur|enrolled|passed|final passage|adopted|calendar|second reading|placed on|ordered engrossed|eligible|reported|do pass|recommend|favorabl|amend|substitute|voted out|committee (report|substitute)/i;
const DEAD_RE = /died|lost|failed|withdrawn|tabled indefinitely|postponed indefinitely/i;
const moved = (b) => b.status === 4 || b.status === 3 || b.status === 2 || (!DEAD_RE.test(b.last_action) && MOVED_RE.test(b.last_action));

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

const stripHtml = (html) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/tr>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#\d+;/g, " ")
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function fetchText(link) {
  const res = await fetch(link.url, { headers: { "User-Agent": "Statecraft/1.0 (student research prototype)" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  const buf = Buffer.from(await res.arrayBuffer());
  if (/pdf/i.test(ct) || /\.pdf($|\?)/i.test(link.url) || buf.subarray(0, 4).toString() === "%PDF") {
    const tmp = `data/texts/_tmp_${Date.now()}.pdf`;
    await writeFile(tmp, buf);
    const { stdout } = await run("python3", ["-I", "-c", `import sys;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);print("\\n".join((p.extract_text() or "") for p in r.pages[:80]))`, tmp], { maxBuffer: 64 << 20 });
    await run("rm", ["-f", tmp]);
    return stdout.trim();
  }
  return stripHtml(buf.toString("utf8"));
}

function pickVersion(versions) {
  if (!versions?.length) return null;
  // Prefer the most recent non-amendment version; prefer an HTML link within it.
  const ranked = versions.filter((v) => v.classification !== "amendment").reverse();
  for (const v of [...ranked, ...versions.slice().reverse()]) {
    const html = v.links.find((l) => /html/i.test(l.media_type) && !/\.pdf/i.test(l.url));
    const pdf = v.links.find((l) => /pdf/i.test(l.media_type) || /\.pdf/i.test(l.url));
    const link = html || pdf || v.links[0];
    if (link) return { note: v.note, link };
  }
  return null;
}

async function main() {
  const data = JSON.parse(await readFile("data/bills.json", "utf8"));
  const targets = data.bills.filter(moved);
  console.error(`${targets.length} moved bills to fetch`);
  await mkdir("data/texts", { recursive: true });
  let done = 0, skipped = 0;
  for (const b of targets) {
    const out = `data/texts/${b.id.replace("ocd-bill/", "")}.json`;
    try { await access(out); skipped++; continue; } catch {}
    try {
      const bill = await api(`/bills/${b.id}`, { include: ["versions", "sponsorships", "abstracts"] });
      const v = pickVersion(bill.versions);
      let text = "", textError = "";
      if (v) { try { text = await fetchText(v.link); } catch (e) { textError = e.message; } }
      const rec = {
        id: b.id, state: b.state, number: b.number,
        version: v ? { note: v.note, url: v.link.url } : null,
        text: text.slice(0, 120000),
        text_chars: text.length,
        text_error: textError,
        abstract: bill.abstracts?.[0]?.abstract ?? "",
        sponsors: (bill.sponsorships ?? []).map((s) => ({
          name: s.person?.name ?? s.name, primary: !!s.primary, classification: s.classification,
          person_id: s.person?.id ?? null, party: s.person?.party ?? null,
          title: s.person?.current_role?.title ?? null, district: s.person?.current_role?.district ?? null,
          chamber: s.person?.current_role?.org_classification ?? null,
        })),
        fetched: new Date().toISOString(),
      };
      await writeFile(out, JSON.stringify(rec));
      done++;
      console.error(`  ${b.state} ${b.number}: ${text.length} chars${textError ? " (" + textError + ")" : ""}`);
    } catch (e) {
      console.error(`  skip ${b.state} ${b.number}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.error(`Done: ${done} fetched, ${skipped} already present.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
