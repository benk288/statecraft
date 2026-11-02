// Pulls the latest text of every moved bill from LegiScan (getBillText returns
// the document base64-encoded) and writes data/texts/<id>.json.
//
// Usage:  LEGISCAN_KEY=xxxx node scripts/fetch_legiscan_texts.mjs

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inScope as moved } from "./movement.mjs";

const run = promisify(execFile);
const KEY = process.env.LEGISCAN_KEY;
if (!KEY) { console.error("Set LEGISCAN_KEY."); process.exit(1); }
const CONCURRENCY = 4;

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
const stripHtml = (html) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/tr>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#\d+;/g, " ")
  .replace(/�/g, "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function decode(doc) {
  const buf = Buffer.from(doc.doc, "base64");
  if (/pdf/i.test(doc.mime) || buf.subarray(0, 4).toString() === "%PDF") {
    const tmp = `data/texts/_tmp_${doc.doc_id}.pdf`;
    await writeFile(tmp, buf);
    const { stdout } = await run("python3", ["-I", "-c", `import sys;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);print("\\n".join((p.extract_text() or "") for p in r.pages[:100]))`, tmp], { maxBuffer: 64 << 20 });
    await run("rm", ["-f", tmp]);
    return stdout.trim();
  }
  if (/word|rtf|octet/i.test(doc.mime)) return ""; // leave .doc/.rtf for a later pass
  return stripHtml(buf.toString("utf8"));
}

async function main() {
  const data = JSON.parse(await readFile("data/bills.json", "utf8"));
  const targets = data.bills.filter((b) => moved(b) && b.text?.doc_id);
  console.error(`${targets.length} moved bills with a text document`);
  await mkdir("data/texts", { recursive: true });
  let i = 0, done = 0, skipped = 0;
  async function worker() {
    while (i < targets.length) {
      const b = targets[i++], out = `data/texts/${b.id}.json`;
      try { await access(out); skipped++; continue; } catch {}
      try {
        const { text: doc } = await api("getBillText", { id: b.text.doc_id });
        const text = await decode(doc);
        await writeFile(out, JSON.stringify({ id: b.id, state: b.state, number: b.number, version: { note: doc.type, url: doc.state_link || doc.url, mime: doc.mime, date: doc.date }, text: text.slice(0, 150000), text_chars: text.length, abstract: b.description, fetched: new Date().toISOString() }));
        done++;
        if (done % 25 === 0) console.error(`  ${done} fetched`);
      } catch (e) { console.error(`  skip ${b.id}: ${e.message}`); }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.error(`Done: ${done} fetched, ${skipped} already present.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
