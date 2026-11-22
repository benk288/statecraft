// Statecraft — legislative radar for a state regulatory practice.
// Screens (hash routes): #/map  #/bill/<id>  #/folders[/<id>]  #/compare  #/clients[/<id>]
// Reads static snapshots (data/*.js); no network at runtime. Clients, folders,
// positions, document links and model bills are saved in this browser only.

const DATA = window.STATECRAFT_DATA || { bills: [], topics: {} };
const ALL_BILLS = DATA.bills || [];
const ANALYSIS = window.STATECRAFT_ANALYSIS || {};
const SPONSORS = window.STATECRAFT_SPONSORS || {};
const TODAY = new Date().toISOString().slice(0, 10);

const FIPS = {"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY","72":"PR"};
const NAMES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",PR:"Puerto Rico"};
const CHAMBER_LABEL = (st, ch) => st === "NE" ? "Legislature" : ch === "H" ? (["CA","NY","NJ","NV","WI"].includes(st) ? "Assembly" : "House") : ch === "S" ? "Senate" : "Other";

const LENSES = {
  sports: [
    { key: "tax", label: "Tax rate", re: /\btax(es|ation|ed)?\b|gross (gaming|wagering) revenue|privilege fee|excise/i },
    { key: "prediction", label: "Prediction markets", re: /prediction market|event contract|futures|cftc|derivative/i },
    { key: "advertising", label: "Advertising", re: /advertis|marketing|promotion|inducement|bonus|push notification|influencer/i },
    { key: "prop", label: "Prop / college", re: /\bprop\b|proposition (bet|wager)|college|collegiate|student[- ]athlete|ncaa|amateur/i },
    { key: "sweeps", label: "Sweepstakes", re: /sweepstake|social casino|dual[- ]currency|skill game|gray market/i },
    { key: "licensing", label: "Licensing", re: /licens|permit|operator|vendor|supplier|registration|fee/i },
    { key: "legalize", label: "Legalization", re: /authoriz|legaliz|mobile|online|internet|interactive|establish(es|ing)? .*wager|sports wagering act/i },
    { key: "integrity", label: "Consumer", re: /self[- ]exclusion|problem gambling|responsible|addiction|minor|age verification|integrity|limit/i },
  ],
  ai: [
    { key: "prediction", label: "Frontier / safety", re: /frontier|foundation model|catastrophic|safety|critical harm|compute/i },
    { key: "licensing", label: "Audits / assessments", re: /impact assessment|audit|register|registration|risk management|documentation/i },
    { key: "prop", label: "Employment / decisions", re: /automated decision|employment|hiring|consequential decision|algorithmic discrimination/i },
    { key: "integrity", label: "Transparency", re: /disclos|transparen|notice|label|watermark|provenance/i },
    { key: "advertising", label: "Deepfakes", re: /deepfake|synthetic|digital replica|likeness|election|intimate/i },
    { key: "sweeps", label: "Chatbots / minors", re: /chatbot|companion|minor|child|student/i },
    { key: "legalize", label: "Government use", re: /state agenc|government|procurement|sandbox|task force|study|innovation/i },
    { key: "tax", label: "Fees", re: /\bfee\b|\btax/i },
  ],
};
LENSES.igaming = [
  { key: "legalize", label: "Legalization", re: /authoriz|legaliz|establish|internet gaming act|online casino/i },
  { key: "tax", label: "Tax rate", re: /\btax|gross gaming revenue|privilege fee|excise/i },
  { key: "licensing", label: "Licensing", re: /licens|permit|operator|platform|vendor|supplier/i },
  { key: "advertising", label: "Advertising", re: /advertis|marketing|promotion|bonus|inducement/i },
  { key: "sweeps", label: "Sweepstakes / social", re: /sweepstake|social casino|dual[- ]currency|skill game|gray market/i },
  { key: "integrity", label: "Consumer", re: /self[- ]exclusion|problem gambling|responsible|addiction|minor|age verification|deposit limit/i },
  { key: "prop", label: "Tribal / compact", re: /tribal|tribe|compact|nation/i },
];
LENSES.cards = [
  { key: "sweeps", label: "Gambling definition", re: /gambl|lottery|game of chance|consideration|prize|wager/i },
  { key: "integrity", label: "Minors / age gating", re: /minor|under (18|21)|age|child|youth/i },
  { key: "legalize", label: "Loot boxes / mystery packs", re: /loot box|mystery|blind box|randomi[sz]ed|chance-based/i },
  { key: "advertising", label: "Livestream / breaks", re: /livestream|live stream|stream|break|auction|marketplace/i },
  { key: "licensing", label: "Licensing / vending", re: /licens|vending|retail|machine|permit/i },
  { key: "tax", label: "Tax", re: /\btax|sales tax|excise/i },
  { key: "prop", label: "Consumer disclosure", re: /disclos|odds|label|notice|refund/i },
];
const lensLabel = (t, key) => (LENSES[t].find((l) => l.key === key) || {}).label || key;
const issuesOf = (b) => ANALYSIS[b.id]?.issue_tags?.length ? ANALYSIS[b.id].issue_tags : (LENSES[b.topics[0]] || []).filter((l) => l.re.test(`${b.title} ${b.description || ""}`)).map((l) => l.key);

const fmtDate = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const fmtShort = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

function movement(b) {
  const a = (b.last_action || "").toLowerCase();
  const next = (b.calendar || []).filter((c) => c.date >= TODAY).sort((x, y) => x.date.localeCompare(y.date))[0];
  if (next) return { level: 3, label: `${/floor|session|reading/i.test(next.type + " " + next.description) ? "Floor" : "Hearing"} ${fmtShort(next.date)}`, upcoming: next };
  if (b.status === 4) return { level: 3, label: "Signed into law" };
  if (b.status === 5) return { level: 3, label: "Vetoed" };
  if (b.status === 3) return { level: 3, label: "Passed both chambers" };
  if (/died|lost|failed|withdrawn|tabled indefinitely|postponed indefinitely|sine die/.test(a)) return { level: 0, label: "" };
  if (/third reading|floor|conference|concur|enrolled|passed|final passage|adopted/.test(a) || b.status === 2) return { level: 3, label: `Passed ${CHAMBER_LABEL(b.state, b.chamber)}` };
  if (/calendar|second reading|placed on|ordered engrossed|eligible/.test(a)) return { level: 2, label: "On the calendar" };
  if (/reported|do pass|recommend|favorabl|amend|substitute|voted out|committee (report|substitute)/.test(a)) return { level: 2, label: "Out of committee" };
  if (/hearing|scheduled|heard/.test(a) || b.calendar?.length) return { level: 1, label: "Heard in committee" };
  return { level: 0, label: "Introduced" };
}
const stageOf = (b) => { const m = movement(b); return m.level === 0 && sessionStatus(b) === "prefile" ? `Prefiled for ${prefileYear(b)}` : m.label || b.status_text; };
const relevance = (b) => ({ core: 0, partial: 1, incidental: 2 })[ANALYSIS[b.id]?.relevance] ?? (b.relevance >= 90 ? 0 : b.relevance >= 60 ? 1 : 2);
const byDateDesc = (a, b) => (b.last_action_date || "").localeCompare(a.last_action_date || "");
const byMovement = (a, b) => movement(b).level - movement(a).level || relevance(a) - relevance(b) || byDateDesc(a, b);
// Editorial one-liner: the official title when it is short, else the first sentence of the AI summary, clipped.
const HEADLINES = window.STATECRAFT_HEADLINES || {};
const headline = (b) => {
  if (HEADLINES[b.id]) return HEADLINES[b.id];
  const t = (b.title || "").replace(/\.$/, ""), s = ANALYSIS[b.id]?.summary ? ANALYSIS[b.id].summary.split(/(?<=\.)\s/)[0].replace(/\.$/, "") : "";
  const pick = t.length <= 110 ? t : (s && s.length < t.length ? s : t);
  return pick.length > 130 ? pick.slice(0, 127).replace(/\s+\S*$/, "") + "…" : pick;
};

// ---- browser-local workspace ----
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const WS_KEY = "statecraft.workspace.v1";
let ws = store(WS_KEY, null);
if (!ws) {
  // Seed from older positions, if any, so nothing is lost.
  ws = { clients: [], folders: [], positions: {}, docs: {}, models: store("statecraft.models.v1", {}) };
  const old = store("statecraft.positions.v2", store("statecraft.positions.v1", {}));
  for (const [billId, list] of Object.entries(old)) for (const p of list) {
    let c = ws.clients.find((x) => x.name === p.who); if (!c) { c = { id: uid(), name: p.who, topics: [] }; ws.clients.push(c); }
    (ws.positions[billId] ||= []).push({ clientId: c.id, stance: p.stance === "Monitor" ? "Watch" : p.stance, note: p.note || "", updated: TODAY });
  }
}
const persist = () => save(WS_KEY, ws);
const STANCES = ["Support", "Oppose", "Amend", "Watch"];
const clientById = (id) => ws.clients.find((c) => c.id === id);
const folderById = (id) => ws.folders.find((f) => f.id === id);
const posOf = (b) => ws.positions[b.id] || [];
const foldersOf = (b) => ws.folders.filter((f) => f.billIds.includes(b.id));
const docsOf = (b) => ws.docs[b.id] || [];
const PUBLIC_STAKEHOLDERS = ["FanDuel", "DraftKings", "Sports Betting Alliance", "American Innovators Network"];
document.getElementById("stakeholders").innerHTML = PUBLIC_STAKEHOLDERS.map((s) => `<option value="${s}">`).join("");

// ---- document files: stored in this browser's IndexedDB; the workspace keeps only their metadata ----
const idb = { db: null,
  open() { return this.db ? Promise.resolve(this.db) : new Promise((res, rej) => { const r = indexedDB.open("statecraft-docs", 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => res(this.db = r.result); r.onerror = () => rej(r.error); }); },
  async put(id, blob) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction("files", "readwrite"); t.objectStore("files").put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async get(id) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction("files").objectStore("files").get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async del(id) { const db = await this.open(); return new Promise((res) => { const t = db.transaction("files", "readwrite"); t.objectStore("files").delete(id); t.oncomplete = res; }); },
};
async function addFiles(billId, files, meta) {
  for (const f of files) {
    if (f.size > 25 * 1024 * 1024) { alert(`${f.name} is over 25 MB.`); continue; }
    const id = uid(); await idb.put(id, f);
    (ws.docs[billId] ||= []).push({ id, kind: "file", name: f.name.replace(/\.[^.]+$/, ""), ext: (f.name.split(".").pop() || "file").toUpperCase().slice(0, 5), size: f.size, meta: meta || `Uploaded ${fmtShort(TODAY)}` });
  }
  persist(); render();
}
async function openDoc(d) {
  if (d.kind !== "file") { window.open(d.url, "_blank", "noopener"); return; }
  const blob = await idb.get(d.id); if (!blob) { alert("This file is not in this browser. Files stay on the computer where they were uploaded."); return; }
  const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const fmtSize = (n) => n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";

// ---- settings (this browser only): the user's own Anthropic key for drafting, their name and firm for letters
let settings = store("statecraft.settings", { apiKey: "", author: "", firm: "", model: "claude-sonnet-5-5" });
let settingsOpen = false, helpOpen = false;
const saveSettings = () => save("statecraft.settings", settings);

// Direct browser call to the Anthropic API with the user's own key. Nothing is proxied; the key never leaves this browser except to Anthropic.
async function askClaude(system, user, maxTokens = 2500) {
  if (!settings.apiKey) throw new Error("NO_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: settings.model || "claude-sonnet-5-5", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
}

// ---- app state ----
const billById = Object.fromEntries(ALL_BILLS.map((b) => [b.id, b]));
let topic = store("statecraft.topic", "sports"); if (topic !== "all" && !DATA.topics[topic]) topic = "sports";
// Sessions: LegiScan names them per state; bucket into the two bienniums the practice works in.
// A bill is only worth watching while its session is alive. LegiScan and Open States tell us which are.
const SESS = window.STATECRAFT_SESSIONS || { bySession: {}, states: {} }, HAVE_SESS = Object.keys(SESS.bySession).length > 0;
const sessionStatus = (b) => SESS.bySession[b.session_id] || "adjourned"; // live | prefile | adjourned
const stateStatus = (st) => SESS.states[st]?.status || "adjourned";
const prefileYear = (b) => SESS.prefileYear?.[b.session_id] || ((b.session || "").match(/20\d\d/) || ["next"])[0];
const SCOPES = [["active", "In session or prefiled"], ["adjourned", "Adjourned sessions"], ["all", "Everything"]];
let scope = HAVE_SESS ? store("statecraft.scope", "active") : "all";
const inScope = (b) => !!q || scope === "all" || (scope === "active") === (sessionStatus(b) !== "adjourned"); // a search looks everywhere
const topicOf = (b) => b.topics[0];
// "New since your last visit": the last snapshot date this browser saw. Anything that moved after it is marked.
// The marker stays for the whole day; the reference point is the previous day this browser opened the app.
let visitDay = store("statecraft.visitDay", null), prevVisit = store("statecraft.prevVisit", null);
if (visitDay !== TODAY) { prevVisit = visitDay; save("statecraft.prevVisit", prevVisit); save("statecraft.visitDay", TODAY); }
const isNew = (b) => !!prevVisit && b.last_action_date > prevVisit && movement(b).level >= 2;
let issue = "ALL", stateFilter = null, q = "", sort = "newest", outline = true;
let selected = new Set(), showFolderPicker = false, showPositionPicker = false;
let shareOpen = false;
let compareSet = store("statecraft.compare", []), compareDiff = true, compareModel = true, showAddBill = false;
let billTab = "summary";
let draft = null; // { billId, posIndex, text, busy, error }
const topicBills = () => ALL_BILLS.filter((b) => (topic === "all" || b.topics.includes(topic)) && inScope(b));
const matches = (b) => (issue === "ALL" || issuesOf(b).includes(issue)) && (!stateFilter || b.state === stateFilter) &&
  (!q || `${b.number} ${b.title} ${b.description} ${b.last_action} ${b.committee || ""} ${(b.sponsors || []).map((s) => s.name).join(" ")} ${posOf(b).map((p) => clientById(p.clientId)?.name).join(" ")} ${ANALYSIS[b.id]?.summary || ""}`.toLowerCase().includes(q));
const moved = () => topicBills().filter((b) => b.status !== 5 && b.status !== 6).filter((b) => movement(b).level >= 2 || sessionStatus(b) === "prefile"); // prefiled bills cannot have moved yet; they are the new session's agenda
const listBills = () => { const l = moved().filter(matches); return sort === "newest" ? l.sort(byDateDesc) : l.sort(byMovement); };
const movedByState = () => { const m = {}; for (const b of moved().filter((b) => issue === "ALL" || issuesOf(b).includes(issue))) m[b.state] = (m[b.state] || 0) + 1; return m; };

// ---- routing ----
const route = () => { const h = location.hash.replace(/^#\/?/, ""); const [page, id] = h.split("/"); return { page: page || "map", id: id ? decodeURIComponent(id) : null }; };
window.addEventListener("hashchange", () => { showFolderPicker = showPositionPicker = showAddBill = false; if (draft && route().id !== draft.billId) draft = null; render(); });
const go = (h) => { location.hash = h; };

// ---- shared chrome ----
function header(active, withSearch) {
  const bills = topicBills(), analysed = bills.filter((b) => ANALYSIS[b.id]).length;
  return `<header class="top">
    <div class="brand">Statecraft</div>
    <nav class="main" aria-label="Main">${[["map", "Map"], ["folders", "Folders"], ["compare", "Compare"], ["clients", "Clients"]].map(([k, l]) => `<a href="#/${k}" class="${active === k ? "on" : ""}">${l}</a>`).join("")}</nav>
    <div class="spacer"></div>
    ${HAVE_SESS ? `<label class="session">Showing <select id="scope">${SCOPES.map(([k, l]) => `<option value="${k}" ${scope === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
    ${withSearch ? `<label class="search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg><input type="search" id="q" placeholder="Search bills, sponsors, clients" aria-label="Search" value="${esc(q)}"></label>` : ""}
    <div class="meta"><b>${bills.length}</b> bills · <b>${analysed}</b> analysed<br>Snapshot ${DATA.generated ? new Date(DATA.generated).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
    <div class="hdr-icons"><button class="icon" id="helpbtn" aria-label="Help" title="How to use Statecraft">?</button><button class="icon" id="gearbtn" aria-label="Settings" title="Settings">⚙</button></div>
  </header>${settingsOpen ? settingsPanel() : ""}${helpOpen ? helpPanel() : ""}`;
}
function topicsBar() {
  const inSession = ALL_BILLS.filter(inScope);
  return `<nav class="topics" aria-label="Topics"><a href="#/map" data-topic="all" class="${topic === "all" ? "on" : ""}">All topics <span>${inSession.length}</span></a>${Object.entries(DATA.topics).map(([k, l]) => `<a href="#/map" data-topic="${k}" class="${topic === k ? "on" : ""}">${esc(l)} <span>${inSession.filter((b) => b.topics.includes(k)).length}</span></a>`).join("")}</nav>`;
}
function settingsPanel() {
  return `<div class="sheet" role="dialog" aria-label="Settings"><div class="sheet-in">
    <div class="list-head"><h2>Settings</h2><button class="icon" id="closesheet" aria-label="Close">×</button></div>
    <p class="muted" style="font-size:13px;margin:4px 0 14px">Everything here stays in this browser. The Anthropic key is used only for drafting letters and is sent only to Anthropic.</p>
    <form id="settingsform" style="display:flex;flex-direction:column;gap:10px">
      <label><span class="kicker muted" style="letter-spacing:.1em">Your name</span><input class="input" name="author" value="${esc(settings.author)}" placeholder="e.g. Jane Doe"></label>
      <label><span class="kicker muted" style="letter-spacing:.1em">Firm or organization</span><input class="input" name="firm" value="${esc(settings.firm)}" placeholder="e.g. Doe Public Policy LLP"></label>
      <label><span class="kicker muted" style="letter-spacing:.1em">Anthropic API key</span><input class="input" name="apiKey" type="password" value="${esc(settings.apiKey)}" placeholder="sk-ant-…" autocomplete="off"><span class="muted" style="font-size:12px">Get one at console.anthropic.com → API keys. Drafting a letter costs about a cent.</span></label>
      <label><span class="kicker muted" style="letter-spacing:.1em">Model for drafting</span><select class="input" name="model"><option value="claude-sonnet-5-5" ${settings.model === "claude-sonnet-5-5" ? "selected" : ""}>Claude Sonnet 5.5 (fast, inexpensive)</option><option value="claude-opus-5-5" ${settings.model === "claude-opus-5-5" ? "selected" : ""}>Claude Opus 5.5 (strongest)</option></select></label>
      <div style="display:flex;gap:8px;align-items:center"><button class="btn solid">Save</button><span class="spacer"></span><button type="button" class="btn sm" id="wsexport2">Export workspace</button><label class="btn sm" style="cursor:pointer">Import<input type="file" id="wsimport2" accept="application/json" hidden></label></div>
    </form></div></div>`;
}
function helpPanel() {
  return `<div class="sheet" role="dialog" aria-label="Help"><div class="sheet-in">
    <div class="list-head"><h2>How to use Statecraft</h2><button class="icon" id="closesheet" aria-label="Close">×</button></div>
    <ol class="hist" style="font-size:13.5px;color:var(--ink)">
      <li><b>Map.</b> By default you see only what can still happen: bills that have moved in a legislature that is in session, and bills prefiled for the next session. States that have adjourned are greyed out because their bills are dead. The <b>Showing</b> menu brings adjourned sessions back; a search always looks everywhere.</li>
      <li><b>Bills.</b> Click any bill for its AI summary, how it differs from other states, the sponsor's record and contact, and its history. Everything links to the official page.</li>
      <li><b>Positions.</b> On a bill, record where a client or stakeholder stands, then <b>Draft letter</b> writes a letter of support, opposition or amendment you can edit, save and email to the sponsor.</li>
      <li><b>Folders.</b> Tick bills on the map and add them to a strategy folder; attach documents, write notes, export a brief, or compare the whole folder.</li>
      <li><b>Compare.</b> Bills side by side by provision, plus your own model bill once you paste it under Clients.</li>
      <li><b>Keyboard.</b> <span class="kbd">/</span> search · <span class="kbd">Esc</span> close.</li>
    </ol>
    <p class="muted" style="font-size:12px;margin-top:12px">Data: state legislatures via LegiScan, snapshot dated top right. AI text can be wrong; the official bill page is the authority. Not legal advice.</p>
  </div></div>`;
}
function wireChrome(root) {
  root.querySelector("#gearbtn")?.addEventListener("click", () => { settingsOpen = !settingsOpen; helpOpen = false; render(); });
  root.querySelector("#helpbtn")?.addEventListener("click", () => { helpOpen = !helpOpen; settingsOpen = false; render(); });
  root.querySelector("#closesheet")?.addEventListener("click", () => { settingsOpen = helpOpen = false; render(); });
  root.querySelector("#settingsform")?.addEventListener("submit", (e) => { e.preventDefault(); const f = e.target; settings = { apiKey: f.apiKey.value.trim(), author: f.author.value.trim(), firm: f.firm.value.trim(), model: f.model.value }; saveSettings(); settingsOpen = false; render(); });
  root.querySelector("#wsexport2")?.addEventListener("click", exportWorkspace);
  root.querySelector("#wsimport2")?.addEventListener("change", (e) => importWorkspace(e.target.files[0]));
  root.querySelector("#scope")?.addEventListener("change", (e) => { scope = e.target.value; save("statecraft.scope", scope); selected.clear(); stateFilter = null; render(); });
  root.querySelectorAll("[data-topic]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); topic = a.dataset.topic; save("statecraft.topic", topic); issue = "ALL"; stateFilter = null; selected.clear(); go("#/map"); render(); }));
  root.querySelector("#q")?.addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; render(); const nq = document.querySelector("#q"); if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); } });
}
const stancePill = (s) => `<span class="stance ${s.toLowerCase()}">${s}</span>`;
const posSummary = (b) => posOf(b).map((p) => `${clientById(p.clientId)?.name || "?"}: ${p.stance}`).join(" · ");

// =============== MAP ===============
const states = topojson.feature(window.US_STATES, window.US_STATES.objects.states).features.filter((f) => FIPS[f.id] && FIPS[f.id] !== "PR");
const color = d3.scaleThreshold().domain([1, 3, 6, 12]).range(["var(--map-0)", "var(--map-1)", "var(--map-2)", "var(--map-3)", "var(--map-4)"]);
function renderMap() {
  const list = listBills();
  const folderStates = new Set(ws.folders.flatMap((f) => f.billIds.map((id) => billById[id]?.state)));
  document.getElementById("app").innerHTML = `${header("map", true)}${topicsBar()}
  <main class="map">
    <section class="map-col" aria-label="Map">
      <div class="issues"><span class="kicker">${topic === "all" ? "Topic" : "Issue"}</span><button class="chip ${issue === "ALL" ? "on" : ""}" data-issue="ALL">All</button>${topic === "all" ? Object.entries(DATA.topics).map(([k, l]) => `<button class="chip" data-topic="${k}">${esc(l)}</button>`).join("") : LENSES[topic].map((l) => `<button class="chip ${issue === l.key ? "on" : ""}" data-issue="${l.key}">${l.label}</button>`).join("")}</div>
      <div id="map-wrap"><svg id="map" role="img" aria-label="Map of US states shaded by bills moved"></svg><div id="tip"></div></div>
      <div class="legend"><b>${scope === "active" && !q ? "Live bills" : "Bills moved"}</b>${["--map-0", "--map-1", "--map-2", "--map-3", "--map-4"].map((v) => `<span class="sw" style="background:var(${v})"></span>`).join("")}<span style="margin-left:8px">0 → 12+</span>${scope === "active" && !q ? `<span class="sw off" style="margin-left:14px"></span><span>Adjourned</span>` : ""}<span class="spacer"></span><label><input type="checkbox" id="outline" ${outline ? "checked" : ""}>Outline states in my folders</label></div>
      ${scope === "active" && !q && HAVE_SESS ? sessionStrip() : ""}
      ${stateFilter ? `<p class="muted" style="margin:10px 0 0;font-size:13px">Showing ${NAMES[stateFilter]} · <a href="#" id="clearstate">show all states</a></p>` : ""}
    </section>
    <aside class="list-col" aria-label="Bills">
      <div class="list-head"><h2>${stateFilter ? NAMES[stateFilter] : "Latest movement"}${list.filter(isNew).length ? ` <span class="newcount">${list.filter(isNew).length} new</span>` : ""}</h2><select id="sort" aria-label="Sort"><option value="newest" ${sort === "newest" ? "selected" : ""}>Newest first</option><option value="furthest" ${sort === "furthest" ? "selected" : ""}>Furthest along</option></select></div>
      <div class="rows">${list.slice(0, 200).map((b) => `<div class="brow ${selected.has(b.id) ? "on" : ""}">
        <input type="checkbox" data-sel="${b.id}" ${selected.has(b.id) ? "checked" : ""} aria-label="Select ${esc(b.number)}">
        <a class="body" href="#/bill/${encodeURIComponent(b.id)}"><div class="where"><b>${NAMES[b.state]} · ${esc(b.number)}${topic === "all" ? ` · ${esc(DATA.topics[topicOf(b)])}` : ""}</b><span>${isNew(b) ? `<i class="newdot" title="Moved since your last visit"></i>` : ""}${fmtShort(b.last_action_date)}</span></div><div class="t">${esc(headline(b))}</div><div class="stage">${esc(stageOf(b))}${posOf(b).length ? ` · <i>${esc(posSummary(b))}</i>` : ""}</div></a></div>`).join("") || `<div class="empty">${scope === "active" && !q && stateFilter && stateStatus(stateFilter) === "adjourned" ? `${NAMES[stateFilter]} has adjourned, so nothing there can move until the next session. <a href="#" id="showadj">See its adjourned bills</a>` : "Nothing is moving in this view."}</div>`}</div>
      ${selected.size ? `<div class="bulk"><b>${selected.size} selected</b><span class="spacer"></span><button class="btn solid" id="tofolder">Add to folder</button><button class="btn" id="setpos">Set position</button><button class="btn" id="tocompare">Compare</button></div>` : ""}
      ${showFolderPicker ? folderPicker([...selected]) : ""}${showPositionPicker ? positionPicker([...selected]) : ""}
    </aside>
  </main>`;
  const app = document.getElementById("app");
  wireChrome(app);
  app.querySelectorAll("[data-issue]").forEach((btn) => btn.addEventListener("click", () => { issue = btn.dataset.issue; render(); }));
  app.querySelector("#sort").addEventListener("change", (e) => { sort = e.target.value; render(); });
  app.querySelector("#outline").addEventListener("change", (e) => { outline = e.target.checked; drawMap(); });
  app.querySelector("#clearstate")?.addEventListener("click", (e) => { e.preventDefault(); stateFilter = null; render(); });
  app.querySelector("#showadj")?.addEventListener("click", (e) => { e.preventDefault(); scope = "adjourned"; save("statecraft.scope", scope); render(); });
  app.querySelectorAll("[data-st]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); stateFilter = stateFilter === a.dataset.st ? null : a.dataset.st; render(); }));
  app.querySelectorAll("[data-sel]").forEach((cb) => cb.addEventListener("change", () => { cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel); render(); }));
  app.querySelector("#tofolder")?.addEventListener("click", () => { showFolderPicker = !showFolderPicker; showPositionPicker = false; render(); });
  app.querySelector("#setpos")?.addEventListener("click", () => { showPositionPicker = !showPositionPicker; showFolderPicker = false; render(); });
  app.querySelector("#tocompare")?.addEventListener("click", () => { compareSet = [...new Set([...compareSet, ...selected])].slice(0, 4); save("statecraft.compare", compareSet); go("#/compare"); });
  wirePickers(app, [...selected]);
  drawMap(folderStates);
}
// One line under the map: which legislatures are alive, so the grey states need no explanation.
function sessionStrip() {
  const of = (k) => Object.entries(SESS.states).filter(([st, v]) => v.status === k && NAMES[st]).sort(([a], [b]) => NAMES[a].localeCompare(NAMES[b]));
  const link = ([st, v]) => `<a href="#" data-st="${st}" class="${stateFilter === st ? "on" : ""}">${NAMES[st]}</a>${v.status === "live" && v.ends ? ` <span class="muted">(ends ${fmtShort(v.ends)})</span>` : ""}`;
  const live = of("live"), pre = of("prefile");
  return `<div class="sess-strip"><div><b>In session</b> ${live.map(link).join(" · ") || "none"}</div>${pre.length ? `<div><b>Prefiling for next session</b> ${pre.map(link).join(" · ")}</div>` : ""}<div class="muted">Every other legislature has adjourned; its bills are dead unless reintroduced. Checked ${fmtShort(SESS.today)}.</div></div>`;
}
function drawMap(folderStates) {
  const svg = d3.select("#map"), wrap = document.getElementById("map-wrap"), tip = document.getElementById("tip");
  if (svg.empty()) return;
  folderStates ||= new Set(ws.folders.flatMap((f) => f.billIds.map((id) => billById[id]?.state)));
  const counts = movedByState(), width = wrap.getBoundingClientRect().width || 800, height = Math.round(width * 0.62);
  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("height", height);
  const projection = d3.geoAlbersUsa().fitExtent([[8, 8], [width - 8, height - 8]], { type: "FeatureCollection", features: states });
  const path = d3.geoPath(projection);
  svg.selectAll("path.state").data(states, (f) => f.id).join("path")
    .attr("class", (f) => "state" + (FIPS[f.id] === stateFilter ? " selected" : "") + (outline && folderStates.has(FIPS[f.id]) ? " infolder" : "") + (scope === "active" && !q && stateStatus(FIPS[f.id]) === "adjourned" ? " off" : ""))
    .attr("d", path).attr("fill", (f) => color(counts[FIPS[f.id]] || 0))
    .on("mousemove", (ev, f) => {
      const st = FIPS[f.id], bills = topicBills().filter((b) => b.state === st), inF = bills.filter((b) => foldersOf(b).length).length;
      const pos = bills.flatMap(posOf), tally = STANCES.map((s) => [s, pos.filter((p) => p.stance === s).length]).filter(([, n]) => n);
      const r = wrap.getBoundingClientRect();
      tip.style.display = "block";
      tip.innerHTML = `<div class="name">${NAMES[st]}</div>${HAVE_SESS ? `<div class="soft">${{ live: `In session${SESS.states[st]?.ends ? `, ends ${fmtShort(SESS.states[st].ends)}` : ""}`, prefile: "Prefiling for next session", adjourned: "Adjourned" }[stateStatus(st)]}</div>` : ""}<div>${counts[st] || 0} ${scope === "active" && !q ? "live" : "moved"}${inF ? ` · ${inF} in your folders` : ""}</div>${tally.length ? `<div class="soft">Positions: ${tally.map(([s, n]) => `${n} ${s.toLowerCase()}`).join(", ")}</div>` : ""}<div class="hint">Click to filter the list →</div>`;
      tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - 240) + "px"; tip.style.top = Math.min(ev.clientY - r.top + 14, r.height - tip.offsetHeight - 10) + "px";
    })
    .on("mouseleave", () => (tip.style.display = "none"))
    .on("click", (ev, f) => { stateFilter = stateFilter === FIPS[f.id] ? null : FIPS[f.id]; render(); });
  svg.selectAll("path.state").filter((f) => FIPS[f.id] === stateFilter).raise();
}

// ---- pickers shared by map bulk bar and bill page ----
function folderPicker(billIds) {
  return `<div class="popover" role="dialog" aria-label="Add to folder"><h3>Add ${billIds.length} bill${billIds.length === 1 ? "" : "s"} to…</h3>
    ${ws.folders.map((f) => `<label><input type="checkbox" data-folder="${f.id}" ${billIds.every((id) => f.billIds.includes(id)) ? "checked" : ""}><span>${esc(f.name)}<small>${esc(clientById(f.clientId)?.name || "Firm-wide")}</small></span></label>`).join("") || `<p class="muted" style="font-size:13px">No folders yet.</p>`}
    <form id="newfolder" style="display:flex;gap:6px;margin-top:10px"><input class="input" name="name" placeholder="New folder name" required><select class="input" name="client" style="width:auto"><option value="">Firm-wide</option>${ws.clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select><button class="btn sm solid">Add</button></form></div>`;
}
function positionPicker(billIds) {
  return `<div class="popover" role="dialog" aria-label="Set position"><h3>Position on ${billIds.length} bill${billIds.length === 1 ? "" : "s"}</h3>
    <form id="posform" style="display:flex;flex-direction:column;gap:10px">
      <input class="input" name="client" list="clients-dl" placeholder="Client or stakeholder" required><datalist id="clients-dl">${[...new Set([...ws.clients.map((c) => c.name), ...PUBLIC_STAKEHOLDERS])].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <div class="seg">${STANCES.map((s, i) => `<button type="button" data-stance="${s}" class="${i === 0 ? "on" : ""}">${s}</button>`).join("")}</div>
      <input type="hidden" name="stance" value="Support"><input class="input" name="note" placeholder="Note (optional)"><button class="btn red">Save position</button></form></div>`;
}
function ensureClient(name) { let c = ws.clients.find((x) => x.name.toLowerCase() === name.toLowerCase()); if (!c) { c = { id: uid(), name, topics: topic === "all" ? [] : [topic] }; ws.clients.push(c); } return c; }
function wirePickers(root, billIds) {
  root.querySelectorAll("[data-folder]").forEach((cb) => cb.addEventListener("change", () => { const f = folderById(cb.dataset.folder); for (const id of billIds) { cb.checked ? (f.billIds.includes(id) || f.billIds.push(id)) : (f.billIds = f.billIds.filter((x) => x !== id)); } persist(); render(); }));
  root.querySelector("#newfolder")?.addEventListener("submit", (e) => { e.preventDefault(); const f = { id: uid(), name: e.target.name.value.trim(), clientId: e.target.client.value || null, notes: "", billIds: [...billIds] }; ws.folders.push(f); persist(); showFolderPicker = false; render(); });
  root.querySelectorAll("[data-stance]").forEach((btn) => btn.addEventListener("click", () => { root.querySelectorAll("[data-stance]").forEach((b) => b.classList.remove("on")); btn.classList.add("on"); root.querySelector("#posform [name=stance]").value = btn.dataset.stance; }));
  root.querySelector("#posform")?.addEventListener("submit", (e) => { e.preventDefault(); const f = e.target, c = ensureClient(f.client.value.trim()); for (const id of billIds) { const list = (ws.positions[id] ||= []).filter((p) => p.clientId !== c.id); list.push({ clientId: c.id, stance: f.stance.value, note: f.note.value.trim(), updated: TODAY }); ws.positions[id] = list; } persist(); showPositionPicker = false; selected.clear(); render(); });
}

// =============== BILL ===============
const textOf = (b) => window.STATECRAFT_TEXTS?.[b.id] ?? null;
let textsLoading = false;
function ensureTexts() { if (window.STATECRAFT_TEXTS || textsLoading) return; textsLoading = true; const s = document.createElement("script"); s.src = "data/texts.js"; s.onload = () => render(); s.onerror = () => { window.STATECRAFT_TEXTS = {}; render(); }; document.body.appendChild(s); }
function progressSteps(b) {
  const h = b.history || [], find = (re) => h.find((x) => re.test(x.action))?.date;
  const first = CHAMBER_LABEL(b.state, b.chamber), second = b.chamber === "H" ? "Senate" : CHAMBER_LABEL(b.state, "H");
  const steps = [
    ["Introduced", h[0]?.date, true],
    ["Out of committee", find(/reported|do pass|favorabl|committee report|voted out/i), movement(b).level >= 2 || b.status >= 2],
    [`Passed ${first}`, find(/passed|third reading passed|adopted/i), b.status >= 2],
    [b.status >= 3 ? `Passed ${second}` : `${second}`, b.status >= 3 ? find(/concur|enrolled|passed both|final passage/i) : null, b.status >= 3],
    [b.status === 4 ? "Signed into law" : b.status === 5 ? "Vetoed" : "Governor", b.status >= 4 ? b.status_date : null, b.status >= 4],
  ];
  const nowIdx = steps.findIndex(([, , done]) => !done);
  return `<ol class="progress" aria-label="Progress">${steps.map(([l, d, done], i) => `<li class="${done ? "done" : i === nowIdx ? "now" : "todo"}"><div class="i">${String(i + 1).padStart(2, "0")}</div><div class="l">${esc(l)}</div><div class="d">${done ? fmtShort(d) || "Done" : i === nowIdx ? (b.status === 6 ? "Dead" : b.sine_die ? "Session adjourned" : "Now") : "Not yet"}</div></li>`).join("")}</ol>`;
}
function renderBill(id) {
  const b = billById[id];
  if (!b) { document.getElementById("app").innerHTML = header("map") + `<div class="empty" style="padding:32px">Bill not found.</div>`; return; }
  const ai = ANALYSIS[b.id], tags = issuesOf(b), prim = (b.sponsors || []).filter((s) => s.primary), spRec = prim.map((s) => SPONSORS[s.people_id]).filter(Boolean)[0];
  if (billTab === "text") ensureTexts();
  const text = textOf(b);
  document.getElementById("app").innerHTML = `${header("map")}
  <div class="crumbs"><a href="#/map">Map</a><span aria-hidden="true">›</span><a href="#/map" id="crumb-state">${NAMES[b.state]}</a><span aria-hidden="true">›</span><span class="here">${esc(b.number)}</span></div>
  <main class="bill">
    <article class="bill-main">
      <div>
        <div class="kicker">${NAMES[b.state]} · ${CHAMBER_LABEL(b.state, b.chamber)} · ${esc(b.topics.map((t) => DATA.topics[t]).join(" · "))}${tags.length ? " · " + tags.map((t) => esc(lensLabel(b.topics[0], t))).join(" · ") : ""}</div>
        <h1>${esc(b.number)}: ${esc(headline(b))}</h1>
        ${HAVE_SESS ? { live: `<div class="sess-line live">In session${SESS.states[b.state]?.ends ? ` · ${esc(b.session)} ends ${fmtShort(SESS.states[b.state].ends)}` : ` · ${esc(b.session)}`}</div>`, prefile: `<div class="sess-line pre">Prefiled for the ${esc(String(prefileYear(b)))} session, which has not convened yet</div>`, adjourned: b.status >= 4 ? "" : `<div class="sess-line dead">Session adjourned · this bill is dead unless it is reintroduced</div>` }[sessionStatus(b)] : ""}
        <p class="lede">${esc(b.description || b.title)}</p>
        <div class="bill-links"><a href="${esc(b.url)}" target="_blank" rel="noopener">Official bill page ↗</a><a href="${esc(b.legiscan_url)}" target="_blank" rel="noopener">Full text ↗</a><span class="muted">Sponsors: ${esc((b.sponsors || []).slice(0, 3).map((s) => s.name.split(" ").slice(-1)[0]).join(", "))}${b.sponsors?.length > 3 ? ` +${b.sponsors.length - 3}` : ""}${prim[0]?.party ? ` (${esc(prim[0].party)})` : ""}</span></div>
      </div>
      ${progressSteps(b)}
      <div class="tabs" role="tablist">${[["summary", "Summary"], ["text", "Bill text"], ["history", "History"], ["sponsor", "Sponsor"]].map(([k, l]) => `<button role="tab" data-tab="${k}" class="${billTab === k ? "on" : ""}">${l}</button>`).join("")}<a href="#/compare" id="cmp-with">Compare with…</a></div>
      <section class="prose">${billTab === "summary" ? (ai ? `<div class="note">AI summary of the bill text. Check it against the official page.</div><p class="big">${esc(ai.summary)}</p><ul>${ai.mechanics.map((m) => `<li>${esc(m)}</li>`).join("")}</ul><h3 style="font-size:18px;margin-top:8px">Versus other states</h3><p>${esc(ai.comparison)}</p><h3 style="font-size:18px">Watch</h3><p>${esc(ai.watch)}</p>` : `<p class="big">${esc(b.description || b.title)}</p><div class="note">No AI summary for this bill yet; summaries cover moved sports-betting bills.</div>`) + relatedSection(b)
        : billTab === "text" ? (text ? `<div class="note">Latest text on file (${esc(b.text?.type || "current")}, ${fmtDate(b.text?.date)}). Truncated to 30,000 characters; use the official link for the full document.</div><pre>${esc(text)}</pre>` : `<div class="note">${window.STATECRAFT_TEXTS ? "Text not in the snapshot for this bill." : "Loading bill text…"}</div>`)
        : billTab === "history" ? `${movement(b).upcoming ? `<p class="big">Scheduled: ${fmtDate(movement(b).upcoming.date)} — ${esc(movement(b).upcoming.description || movement(b).upcoming.type)}</p>` : ""}<ol class="hist">${(b.history || []).slice().reverse().map((h) => `<li><b>${fmtDate(h.date)}</b> ${esc(h.action)}</li>`).join("")}</ol>${b.calendar?.length ? `<h3 style="font-size:18px;margin-top:12px">Hearings &amp; calendar</h3><ol class="hist">${b.calendar.slice().sort((x, y) => y.date.localeCompare(x.date)).map((c) => `<li><b>${fmtDate(c.date)}</b> ${esc(c.description || c.type)}${c.location ? ` — ${esc(c.location)}` : ""}</li>`).join("")}</ol>` : ""}`
        : sponsorSection(b)}</section>
    </article>
    <aside class="bill-side">
      <section class="card">
        <h2>Client positions</h2>
        ${posOf(b).map((p, i) => `<div class="posrow"><div class="hd"><a href="#/clients/${p.clientId}">${esc(clientById(p.clientId)?.name || "?")}</a><span>${stancePill(p.stance)}<button class="x" data-delpos="${i}" title="Remove">×</button></span></div>${p.note ? `<div class="note">${esc(p.note)}</div>` : ""}<div class="by" style="display:flex;justify-content:space-between;align-items:center">Updated ${fmtShort(p.updated)}${p.stance !== "Watch" ? `<button class="btn sm" data-draft="${i}">${draft && draft.billId === b.id && draft.posIndex === i ? "Redraft" : "Draft letter"}</button>` : ""}</div></div>`).join("") || `<p class="muted" style="font-size:13px;margin:8px 0 0">No positions yet.</p>`}
        <form class="addpos" id="posform"><div class="kicker">Add a position</div>
          <input class="input" name="client" list="clients-dl" placeholder="Client or stakeholder" required><datalist id="clients-dl">${[...new Set([...ws.clients.map((c) => c.name), ...PUBLIC_STAKEHOLDERS])].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
          <div class="seg">${STANCES.map((s, i) => `<button type="button" data-stance="${s}" class="${i === 0 ? "on" : ""}">${s}</button>`).join("")}</div><input type="hidden" name="stance" value="Support">
          <input class="input" name="note" placeholder="Note (optional)"><button class="btn red">Save position</button></form>
      </section>
      ${draft && draft.billId === b.id ? letterCard(b) : ""}
      ${sponsorCard(b)}
      <section><h2 style="font-size:20px;margin-bottom:10px">In folders</h2><div class="pills">${foldersOf(b).map((f) => `<a class="pill" href="#/folders/${f.id}">${esc(f.name)}<button data-unfolder="${f.id}" title="Remove from folder">×</button></a>`).join("")}<button class="btn dashed sm" id="addfolder">+ Add to folder</button></div>${showFolderPicker ? `<div style="position:relative;margin-top:12px">${folderPicker([b.id]).replace('class="popover"', 'class="popover" style="position:static;width:auto"')}</div>` : ""}</section>
      <section><h2 style="font-size:20px;margin-bottom:6px">Documents</h2>
        ${docsOf(b).map((d, i) => `<a class="doc" href="#" data-opendoc="${i}"><span class="ext">${esc(d.ext)}</span><span style="flex:1"><span class="nm">${esc(d.name)}</span><span class="mt">${esc(d.meta)}${d.size ? ` · ${fmtSize(d.size)}` : ""}${d.kind !== "file" ? " · link" : ""}</span></span><button class="x" data-deldoc="${i}" style="border:0;background:none;color:var(--muted)" title="Remove">×</button></a>`).join("")}
        <div class="dropzone" id="dropzone">Drop files here or <label style="color:var(--red);font-weight:600;cursor:pointer">upload<input type="file" id="docfiles" multiple hidden></label> · testimony, amendments, memos
          <details><summary style="cursor:pointer;color:var(--muted)">or link a document</summary><form id="docform" style="display:flex;flex-direction:column;gap:6px;margin-top:8px"><div class="row"><input class="input" name="name" placeholder="Name" required><input class="input" name="url" type="url" placeholder="https://…" required></div><div class="row"><input class="input" name="meta" placeholder="Who / when (optional)"><button class="btn sm">Add link</button></div></form></details></div>
      </section>
    </aside>
  </main>`;
  const app = document.getElementById("app");
  wireChrome(app);
  app.querySelector("#crumb-state").addEventListener("click", () => { stateFilter = b.state; });
  app.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => { billTab = btn.dataset.tab; render(); }));
  app.querySelectorAll("[data-cmpadd]").forEach((btn) => btn.addEventListener("click", () => { compareSet = [...new Set([...compareSet, b.id, btn.dataset.cmpadd])].slice(-4); save("statecraft.compare", compareSet); go("#/compare"); }));
  app.querySelector("#cmp-with").addEventListener("click", () => { if (!compareSet.includes(b.id)) compareSet = [...compareSet, b.id].slice(-4); save("statecraft.compare", compareSet); });
  app.querySelectorAll("[data-delpos]").forEach((btn) => btn.addEventListener("click", () => { ws.positions[b.id].splice(Number(btn.dataset.delpos), 1); if (!ws.positions[b.id].length) delete ws.positions[b.id]; if (draft?.billId === b.id) draft = null; persist(); render(); }));
  app.querySelectorAll("[data-draft]").forEach((btn) => btn.addEventListener("click", () => draftLetter(b, Number(btn.dataset.draft))));
  app.querySelector("#closeletter")?.addEventListener("click", () => { draft = null; render(); });
  app.querySelector("#openset")?.addEventListener("click", () => { settingsOpen = true; render(); });
  const lt = app.querySelector("#lettertext"); lt?.addEventListener("input", () => { draft.text = lt.value; });
  app.querySelector("#saveletter")?.addEventListener("click", async () => { const p = posOf(b)[draft.posIndex]; const name = `${LETTER_KIND[p.stance]} — ${clientById(p.clientId)?.name || "client"}`; const f = new File([draft.text], name + ".md", { type: "text/markdown" }); await addFiles(b.id, [f], `${settings.author || "You"} · ${fmtShort(TODAY)}`); });
  app.querySelector("#copyletter")?.addEventListener("click", async (e) => { await navigator.clipboard.writeText(draft.text); e.target.textContent = "Copied"; setTimeout(() => (e.target.textContent = "Copy"), 1500); });
  app.querySelector("#dlletter")?.addEventListener("click", () => { const p = posOf(b)[draft.posIndex]; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([draft.text], { type: "text/plain" })); a.download = `${b.state}-${b.number}-${p.stance.toLowerCase()}-letter.txt`; a.click(); });
  app.querySelector("#mailletter")?.addEventListener("click", (e) => { e.preventDefault(); const sp = (b.sponsors || []).find((s) => s.primary) || b.sponsors?.[0], email = SPONSORS[sp?.people_id]?.links?.email, p = posOf(b)[draft.posIndex]; const subject = `${b.state} ${b.number}: ${LETTER_KIND[p.stance]} from ${clientById(p.clientId)?.name || "client"}`; const body = draft.text.length > 1800 ? draft.text.slice(0, 1800) + "\n\n[Letter continues — full text attached]" : draft.text; window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; });
  app.querySelectorAll("[data-unfolder]").forEach((btn) => btn.addEventListener("click", (e) => { e.preventDefault(); const f = folderById(btn.dataset.unfolder); f.billIds = f.billIds.filter((x) => x !== b.id); persist(); render(); }));
  app.querySelector("#addfolder").addEventListener("click", () => { showFolderPicker = !showFolderPicker; render(); });
  app.querySelectorAll("[data-deldoc]").forEach((btn) => btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); const d = ws.docs[b.id].splice(Number(btn.dataset.deldoc), 1)[0]; if (d?.kind === "file") idb.del(d.id); persist(); render(); }));
  app.querySelectorAll("[data-opendoc]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openDoc(docsOf(b)[Number(a.dataset.opendoc)]); }));
  app.querySelector("#docfiles").addEventListener("change", (e) => addFiles(b.id, [...e.target.files]));
  const dz = app.querySelector("#dropzone");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.style.borderColor = "var(--red)"; });
  dz.addEventListener("dragleave", () => { dz.style.borderColor = ""; });
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.style.borderColor = ""; addFiles(b.id, [...e.dataTransfer.files]); });
  app.querySelector("#docform").addEventListener("submit", (e) => { e.preventDefault(); const f = e.target, url = f.url.value.trim(), ext = (url.match(/\.(pdf|docx?|md|xlsx?|pptx?)(\?|$)/i)?.[1] || "LINK").toUpperCase(); (ws.docs[b.id] ||= []).push({ id: uid(), kind: "link", name: f.name.value.trim(), url, ext, meta: f.meta.value.trim() || `Added ${fmtShort(TODAY)}` }); persist(); render(); });
  wirePickers(app, [b.id]);
}
// Other states' bills on the same issues, ranked by shared issue tags and shared title words.
function relatedBills(b, n = 5) {
  const mine = new Set(issuesOf(b)), words = new Set(tokens(b.title));
  return ALL_BILLS.filter((o) => o.id !== b.id && o.state !== b.state && o.topics[0] === b.topics[0] && movement(o).level >= 2)
    .map((o) => { const tags = issuesOf(o).filter((t) => mine.has(t)).length, tw = tokens(o.title).filter((w) => words.has(w)).length; return { o, score: tags * 2 + tw - relevance(o) }; })
    .filter((x) => x.score > 0).sort((x, y) => y.score - x.score || byDateDesc(x.o, y.o)).slice(0, n).map((x) => x.o);
}
function relatedSection(b) {
  const rel = relatedBills(b);
  if (!rel.length) return "";
  return `<h3 style="font-size:18px;margin-top:8px">Related bills in other states</h3>${rel.map((o) => `<div class="todo-row"><a class="num" href="#/bill/${encodeURIComponent(o.id)}">${o.state} ${esc(o.number)}</a><span class="t">${esc(headline(o))}</span><span class="stage">${esc(stageOf(o))}</span><button class="btn sm" data-cmpadd="${o.id}">Compare</button></div>`).join("")}`;
}
// ---- letter drafting ----
const LETTER_KIND = { Support: "letter of support", Oppose: "letter of opposition", Amend: "letter requesting amendments" };
function letterPrompt(b, p) {
  const ai = ANALYSIS[b.id], client = clientById(p.clientId)?.name || "our client", sp = (b.sponsors || []).find((s) => s.primary) || b.sponsors?.[0];
  const m = ws.models[b.topics[0]] || ws.models.sports || {}, t = textOf(b), cmp = m.text && t ? modelCoverage(m.text, t) : null;
  const next = movement(b).upcoming;
  const system = `You draft advocacy correspondence for a state government-relations practice. Write a ${LETTER_KIND[p.stance]} on behalf of a client, addressed to the bill's sponsor or the committee as appropriate. Formal, concise, specific to the bill's actual provisions; cite section numbers or figures from the summary when useful; never invent provisions, facts or statistics; no placeholders except [DATE] if a date is unknown. Plain text with paragraph breaks, 250–450 words, ready to send. Sign as the author given.`;
  const user = [
    `Bill: ${b.state} ${b.number} — ${b.title}`, `Status: ${stageOf(b)}; last action ${fmtDate(b.last_action_date)}: ${b.last_action}`,
    b.committee ? `Committee: ${b.committee}` : "", next ? `Hearing: ${fmtDate(next.date)} ${next.description || ""}` : "",
    sp ? `Sponsor: ${sp.name}${sp.party ? ` (${sp.party})` : ""}${sp.role ? `, ${sp.role}` : ""}${sp.district ? ` ${sp.district}` : ""}` : "",
    ai ? `Summary: ${ai.summary}\nKey provisions:\n- ${ai.mechanics.join("\n- ")}\nVersus other states: ${ai.comparison}\nWatch: ${ai.watch}` : `Official description: ${b.description || b.title}`,
    `Client: ${client}. Position: ${p.stance}.${p.note ? ` Client's note: ${p.note}` : ""}`,
    cmp && cmp.missing.length ? `Provisions in the client's model legislation that this bill lacks (use for an amendments or support-with-changes argument):\n- ${cmp.missing.slice(0, 5).join("\n- ")}` : "",
    `Author: ${settings.author || "[Your name]"}${settings.firm ? `, ${settings.firm}` : ""}, on behalf of ${client}.`,
  ].filter(Boolean).join("\n");
  return { system, user };
}
async function draftLetter(b, i) {
  const p = posOf(b)[i]; if (!p) return;
  draft = { billId: b.id, posIndex: i, text: "", busy: true, error: null }; render();
  try { const { system, user } = letterPrompt(b, p); draft.text = await askClaude(system, user); }
  catch (e) { draft.error = e.message === "NO_KEY" ? "Add your Anthropic API key in Settings (⚙) to draft letters." : e.message; }
  draft.busy = false; render();
}
function letterCard(b) {
  const p = posOf(b)[draft.posIndex], client = p ? clientById(p.clientId)?.name : "", sp = (b.sponsors || []).find((s) => s.primary) || b.sponsors?.[0], email = SPONSORS[sp?.people_id]?.links?.email;
  return `<section class="card" id="lettercard"><div class="list-head"><h2>${p ? LETTER_KIND[p.stance].replace(/^./, (c) => c.toUpperCase()) : "Letter"}</h2><button class="icon" id="closeletter" aria-label="Close">×</button></div>
    <div class="muted" style="font-size:12.5px;margin:2px 0 10px">For ${esc(client)} · ${sp ? `to ${esc(sp.name)}` : ""}${b.committee ? ` · ${esc(b.committee)}` : ""}. Drafted by Claude from the bill summary and your position; edit before sending.</div>
    ${draft.busy ? `<div class="muted" style="padding:20px 0;font-style:italic">Drafting…</div>` : draft.error ? `<div style="color:var(--red);font-size:13.5px;padding:8px 0">${esc(draft.error)}${/Settings/.test(draft.error) ? ` <button class="btn sm" id="openset">Open Settings</button>` : ""}</div>`
      : `<textarea class="input" id="lettertext" style="font-family:var(--serif);font-size:15px;line-height:1.55;min-height:360px;background:#fff">${esc(draft.text)}</textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn solid sm" id="saveletter">Save to documents</button><button class="btn sm" id="copyletter">Copy</button><button class="btn sm" id="dlletter">Download</button>${email ? `<a class="btn sm" id="mailletter" href="#">Email ${esc(sp.name.split(" ").slice(-1)[0])}</a>` : `<span class="muted" style="font-size:12px;align-self:center">No sponsor email on record</span>`}</div>`}</section>`;
}
const money$ = (n) => n == null ? "—" : "$" + Math.round(Number(n)).toLocaleString();
function sponsorCard(b) {
  const prim = (b.sponsors || []).filter((s) => s.primary).slice(0, 2);
  if (!prim.length) return "";
  return `<section class="card" style="padding:0;overflow:hidden">${prim.map((s) => { const r = SPONSORS[s.people_id], L = r?.links || {}, mo = r?.money;
    return `<div style="padding:16px 18px;border-bottom:1px solid var(--rule-faint)"><div style="display:flex;gap:12px;align-items:flex-start">${L.image ? `<img src="${esc(L.image)}" alt="" style="width:56px;height:56px;object-fit:cover;border:1px solid var(--rule);flex:none">` : ""}<div style="min-width:0"><div class="kicker">Sponsor</div><div style="font-family:var(--serif);font-size:20px;font-weight:600;line-height:1.15">${esc(s.name)}</div><div class="muted" style="font-size:12.5px;margin-top:2px">${esc([s.party, s.role, s.district].filter(Boolean).join(" · "))}</div></div></div>
      ${r ? `<div class="tally" style="margin-top:12px"><div style="flex:1"><div class="n" style="font-size:22px">${r.bills_total}</div><div class="l">Sponsored</div></div><div style="flex:1"><div class="n" style="font-size:22px">${r.passed_chamber}</div><div class="l">Passed</div></div><div style="flex:1"><div class="n" style="font-size:22px">${r.enacted}</div><div class="l">Enacted</div></div></div>` : ""}
      ${mo ? `<div style="margin-top:12px"><div class="kicker" style="color:var(--muted)">Money · ${esc(mo.cycle || "latest cycle")}</div><div style="font-family:var(--serif);font-size:24px;font-weight:800;margin-top:2px">${money$(mo.total_raised)} <span class="muted" style="font-family:var(--sans);font-size:12px;font-weight:400">raised</span></div>
        ${(mo.top_contributors || []).length ? `<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:12.5px">${mo.top_contributors.slice(0, 5).map((c) => `<tr><td style="padding:4px 0;border-top:1px solid var(--rule-faint)">${esc(c.name)}<span class="muted"> · ${esc(c.type || "")}</span></td><td style="padding:4px 0;border-top:1px solid var(--rule-faint);text-align:right;font-weight:600;white-space:nowrap">${money$(c.amount)}</td></tr>`).join("")}</table>` : ""}
        ${(mo.industries || []).length ? `<div class="muted" style="font-size:12px;margin-top:6px">Industries: ${esc(mo.industries.slice(0, 4).map((x) => `${x.name}${x.amount ? " " + money$(x.amount) : ""}`).join(" · "))}</div>` : ""}
        ${mo.gaming_or_tech ? `<div style="font-size:12.5px;margin-top:6px;padding:8px 10px;background:var(--wash)">${esc(mo.gaming_or_tech)}</div>` : ""}
        <div class="muted" style="font-size:11.5px;margin-top:6px">AI-researched ${esc(mo.researched || "")} · confidence ${esc(mo.confidence || "?")}${mo.note ? ` · ${esc(mo.note)}` : ""}${(mo.sources || []).length ? ` · ${mo.sources.slice(0, 3).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">source ${i + 1}</a>`).join(" ")}` : ""}</div></div>`
        : `<div class="muted" style="font-size:12px;margin-top:10px">Contributor research not run for this sponsor yet. <a href="https://www.opensecrets.org/search?q=${encodeURIComponent(s.name)}" target="_blank" rel="noopener">OpenSecrets ↗</a></div>`}
      <div class="bill-links" style="margin-top:10px;font-size:12.5px">${[L.official && `<a href="${esc(L.official)}" target="_blank" rel="noopener">Official page</a>`, (L.ballotpedia || s.ballotpedia) && `<a href="${esc(L.ballotpedia || "https://ballotpedia.org/" + s.ballotpedia)}" target="_blank" rel="noopener">Ballotpedia</a>`, L.email && `<a href="mailto:${esc(L.email)}">Email</a>`, L.capitol_phone && `<span class="muted">${esc(L.capitol_phone)}</span>`].filter(Boolean).join("")}</div></div>`; }).join("")}</section>`;
}
function sponsorSection(b) {
  const prim = (b.sponsors || []).filter((s) => s.primary), rest = (b.sponsors || []).filter((s) => !s.primary);
  if (!prim.length && !rest.length) return `<p class="muted">No sponsor on record.</p>`;
  return (prim.length ? prim : rest.slice(0, 1)).map((s) => { const r = SPONSORS[s.people_id], L = r?.links || {}; const bp = L.ballotpedia || (s.ballotpedia ? `https://ballotpedia.org/${s.ballotpedia}` : null);
    return `<div><p class="big">${esc(s.name)} <span class="muted" style="font-size:15px">${esc([s.party, s.role, s.district].filter(Boolean).join(" · "))}</span></p>
      ${r ? `<div class="tally" style="display:inline-flex;margin:8px 0 12px"><div><div class="n">${r.bills_total}</div><div class="l">Sponsored</div></div><div><div class="n">${r.passed_chamber}</div><div class="l">Passed a chamber</div></div><div><div class="n">${r.enacted}</div><div class="l">Enacted</div></div></div><div class="note">This session, sponsored or co-sponsored, from the legislature's records.${r.sample?.length ? ` Also passed: ${esc(r.sample.map((x) => x.split(":")[0]).join(", "))}.` : ""}</div>` : ""}
      <div class="bill-links">${[L.official && `<a href="${esc(L.official)}" target="_blank" rel="noopener">Official page ↗</a>`, bp && `<a href="${esc(bp)}" target="_blank" rel="noopener">Ballotpedia ↗</a>`, `<a href="https://www.opensecrets.org/search?q=${encodeURIComponent(s.name)}" target="_blank" rel="noopener">Contributions (OpenSecrets) ↗</a>`, L.email && `<a href="mailto:${esc(L.email)}">Email</a>`, L.capitol_phone && `<span class="muted">${esc(L.capitol_phone)}</span>`].filter(Boolean).join("")}</div></div>`; }).join("<hr style='border:0;border-top:1px solid var(--rule-soft)'>") +
    (rest.length ? `<p class="muted" style="font-size:13px">Co-sponsors: ${esc(rest.map((s) => s.name).join(", "))}</p>` : "");
}

// =============== FOLDERS ===============
function renderFolders(id) {
  const f = folderById(id) || ws.folders[0];
  const groups = [...ws.clients.map((c) => [c.name, ws.folders.filter((x) => x.clientId === c.id)]), ["Firm-wide", ws.folders.filter((x) => !x.clientId)]].filter(([, l]) => l.length);
  const bills = f ? f.billIds.map((x) => billById[x]).filter(Boolean).sort((a, b) => a.state.localeCompare(b.state)) : [];
  const docs = bills.flatMap(docsOf);
  document.getElementById("app").innerHTML = `${header("folders")}
  <div class="split">
    <nav class="sidenav" aria-label="Folders"><form id="newfolder" style="display:flex;flex-direction:column;gap:6px"><button class="btn solid" type="button" id="newbtn">+ New folder</button><div id="newfields" hidden style="display:flex;flex-direction:column;gap:6px"><input class="input" name="name" placeholder="Folder name" required><select class="input" name="client"><option value="">Firm-wide</option>${ws.clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select><button class="btn sm">Create</button></div></form>
      ${groups.map(([name, list]) => `<div class="group"><div class="kicker">${esc(name)}</div>${list.map((x) => `<a class="item ${f && x.id === f.id ? "on" : ""}" href="#/folders/${x.id}"><span>${esc(x.name)}</span><span>${x.billIds.length || "—"}</span></a>`).join("")}</div>`).join("") || `<p class="muted" style="font-size:13px">Select bills on the map and choose “Add to folder”.</p>`}</nav>
    <main class="content">${f ? `
      <div class="titlebar double"><div><div class="kicker">${esc(clientById(f.clientId)?.name || "Firm-wide")} · Strategy folder</div><h1><input id="fname" value="${esc(f.name)}" aria-label="Folder name"></h1><div class="muted" style="font-size:13.5px">${bills.length} bills · ${new Set(bills.map((b) => b.state)).size} states · ${docs.length} documents</div></div>
        <div class="actions"><a class="btn" href="#/compare" id="cmpall">Compare all ${Math.min(bills.length, 4)}</a><button class="btn" id="brief">Export brief</button><button class="btn" id="print">Print</button><button class="btn" id="share">Share</button><button class="btn" id="delfolder" style="color:var(--red)">Delete</button></div></div>
      ${shareOpen ? `<div class="card" id="sharebox"><h2 style="font-size:20px;margin-bottom:6px">Share this workspace</h2><p class="muted" style="font-size:13px;margin:0 0 10px">There is no server yet, so sharing is a file: export your clients, folders, positions and document links, send the file, and the other person imports it. Imports merge; nothing is overwritten.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn solid sm" id="wsexport">Export workspace</button><label class="btn sm" style="cursor:pointer">Import workspace<input type="file" id="wsimport" accept="application/json" hidden></label></div></div>` : ""}
      <label><span class="kicker muted" style="letter-spacing:.1em">Strategy notes</span><textarea class="input" id="fnotes" placeholder="What are we trying to do across these bills?">${esc(f.notes)}</textarea></label>
      ${bills.map((b) => { const p = posOf(b), mv = movement(b); return `<section class="fstate rule-top"><div class="hd"><h2>${NAMES[b.state]}</h2><span class="muted" style="font-size:13px">${esc(b.committee ? `${b.committee} has it` : b.sine_die ? "Session adjourned" : b.status_text)}</span></div>
        <div class="frow"><a class="num" href="#/bill/${encodeURIComponent(b.id)}">${esc(b.number)}</a><a class="t" href="#/bill/${encodeURIComponent(b.id)}">${esc(headline(b))}</a><span class="muted">${esc(stageOf(b))}</span><span>${p.length ? stancePill(p[0].stance) : `<span class="muted" style="font-size:12px">No position</span>`}</span><span class="muted" style="font-size:13px">${mv.upcoming ? `Hearing ${fmtShort(mv.upcoming.date)}` : fmtShort(b.last_action_date)}</span></div>
        <div class="docs-row">${docsOf(b).map((d, i) => `<a href="#" data-fdoc="${b.id}|${i}"><b>${esc(d.ext)}</b>${esc(d.name)}</a>`).join("")}<a class="btn dashed sm" href="#/bill/${encodeURIComponent(b.id)}">+ Add document</a><button class="rm" data-rm="${b.id}" style="margin-left:auto;align-self:center">Remove from folder</button></div></section>`; }).join("") || `<div class="empty">This folder is empty. Select bills on the map and add them.</div>`}`
      : `<div class="empty">No folders yet. Select bills on the map and choose “Add to folder”, or create one on the left.</div>`}</main></div>`;
  const app = document.getElementById("app");
  wireChrome(app);
  app.querySelector("#newbtn").addEventListener("click", () => { const d = app.querySelector("#newfields"); d.hidden = !d.hidden; });
  app.querySelector("#newfolder").addEventListener("submit", (e) => { e.preventDefault(); const nf = { id: uid(), name: e.target.name.value.trim(), clientId: e.target.client.value || null, notes: "", billIds: [] }; ws.folders.push(nf); persist(); go(`#/folders/${nf.id}`); });
  if (!f) return;
  app.querySelector("#fname").addEventListener("change", (e) => { f.name = e.target.value.trim() || f.name; persist(); render(); });
  app.querySelector("#fnotes").addEventListener("input", (e) => { f.notes = e.target.value; persist(); });
  app.querySelector("#cmpall").addEventListener("click", () => { compareSet = f.billIds.slice(0, 4); save("statecraft.compare", compareSet); });
  app.querySelector("#delfolder").addEventListener("click", () => { if (confirm(`Delete folder “${f.name}”? Bills and positions are kept.`)) { ws.folders = ws.folders.filter((x) => x.id !== f.id); persist(); go("#/folders"); } });
  app.querySelector("#brief").addEventListener("click", () => exportBrief(f, bills));
  app.querySelector("#print").addEventListener("click", () => window.print());
  app.querySelector("#share").addEventListener("click", () => { shareOpen = !shareOpen; render(); });
  app.querySelector("#wsexport")?.addEventListener("click", exportWorkspace);
  app.querySelector("#wsimport")?.addEventListener("change", (e) => importWorkspace(e.target.files[0]));
  app.querySelectorAll("[data-rm]").forEach((btn) => btn.addEventListener("click", () => { f.billIds = f.billIds.filter((x) => x !== btn.dataset.rm); persist(); render(); }));
  app.querySelectorAll("[data-fdoc]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); const [id, i] = a.dataset.fdoc.split("|"); openDoc(docsOf(billById[id])[Number(i)]); }));
}
function exportWorkspace() {
  const blob = new Blob([JSON.stringify({ statecraft: 1, exported: new Date().toISOString(), ...ws }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `statecraft-workspace-${TODAY}.json`; a.click();
}
async function importWorkspace(file) {
  if (!file) return;
  try {
    const inc = JSON.parse(await file.text());
    if (inc.statecraft !== 1) throw new Error("not a Statecraft workspace file");
    const nameToId = {};
    for (const c of inc.clients || []) { const mine = ensureClient(c.name); mine.topics = [...new Set([...(mine.topics || []), ...(c.topics || [])])]; nameToId[c.id] = mine.id; }
    for (const f of inc.folders || []) { const key = `${f.name}|${f.clientId ? nameToId[f.clientId] : ""}`; let mine = ws.folders.find((x) => `${x.name}|${x.clientId || ""}` === key); if (!mine) { mine = { id: uid(), name: f.name, clientId: f.clientId ? nameToId[f.clientId] : null, notes: "", billIds: [] }; ws.folders.push(mine); } mine.billIds = [...new Set([...mine.billIds, ...(f.billIds || []).filter((id) => billById[id])])]; if (f.notes && !mine.notes) mine.notes = f.notes; }
    for (const [billId, list] of Object.entries(inc.positions || {})) for (const p of list) { const cid = nameToId[p.clientId]; if (!cid || !billById[billId]) continue; const cur = (ws.positions[billId] ||= []); const ex = cur.find((x) => x.clientId === cid); if (!ex) cur.push({ ...p, clientId: cid }); else if ((p.updated || "") > (ex.updated || "")) Object.assign(ex, p, { clientId: cid }); }
    for (const [billId, list] of Object.entries(inc.docs || {})) { if (!billById[billId]) continue; const cur = (ws.docs[billId] ||= []); for (const d of list) if (!cur.some((x) => x.url === d.url)) cur.push(d); }
    persist(); shareOpen = false; render(); alert("Workspace imported and merged.");
  } catch (e) { alert(`Could not import: ${e.message}`); }
}
function exportBrief(f, bills) {
  const lines = [`# ${f.name}`, `${clientById(f.clientId)?.name || "Firm-wide"} · ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}`, "", f.notes ? `## Strategy\n${f.notes}\n` : ""];
  for (const b of bills) { const ai = ANALYSIS[b.id], p = posOf(b); lines.push(`## ${b.state} ${b.number} — ${headline(b)}`, `${stageOf(b)} · last action ${fmtDate(b.last_action_date)}: ${b.last_action}`, p.length ? `Positions: ${p.map((x) => `${clientById(x.clientId)?.name}: ${x.stance}${x.note ? ` (${x.note})` : ""}`).join("; ")}` : "", ai ? `\n${ai.summary}\n\n${ai.mechanics.map((m) => `- ${m}`).join("\n")}\n\nVersus other states: ${ai.comparison}\n\nWatch: ${ai.watch}` : `\n${b.description || b.title}`, `Official: ${b.url}`, ""); }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${f.name.replace(/[^\w]+/g, "-")}-brief.md`; a.click();
}

// =============== COMPARE ===============
const STOP = new Set("the of and to a in for or by an be is are as that this with shall on at any such from which not may under its it will their".split(" "));
const tokens = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const sentences = (text) => text.replace(/\s+/g, " ").split(/(?<=[.;])\s+(?=[A-Z(§\d])/).map((s) => s.trim()).filter((s) => s.length > 40 && s.length < 600);
function modelCoverage(modelText, bill) {
  const ms = sentences(modelText), bs = sentences(bill), bsets = bs.map((s) => new Set(tokens(s)));
  const scoreOf = (set, other) => { let inter = 0; for (const w of set) if (other.has(w)) inter++; return inter / Math.max(1, Math.min(set.size, other.size)); };
  const covered = [], missing = [];
  for (const s of ms) { const set = new Set(tokens(s)); let best = 0; bsets.forEach((o) => { best = Math.max(best, scoreOf(set, o)); }); (best >= 0.6 ? covered : missing).push(s); }
  return { covered, missing, coverage: ms.length ? covered.length / ms.length : 0 };
}
// Provision rows for the compare table: each bill's AI key provisions sorted into the practice's topics.
const PROVISIONS = [
  ["Tax rate", /\btax|gross (gaming|wagering) revenue|privilege fee|excise|rate of/i],
  ["Licensing & fees", /licens|permit|fee\b|operator|vendor|supplier|registration/i],
  ["Prediction markets", /prediction market|event contract|futures|cftc/i],
  ["Advertising", /advertis|marketing|promotion|inducement|bonus|push notification/i],
  ["Prop / college bets", /\bprop\b|proposition|college|collegiate|student[- ]athlete|ncaa/i],
  ["Account limits & deposits", /limit|deposit|withdraw|credit card|account/i],
  ["Consumer protection", /self[- ]exclusion|problem gambling|responsible|addiction|minor|age|notice|disclos/i],
  ["Reporting", /report|audit|record|data/i],
  ["Penalties & enforcement", /penalt|fine|violation|enforce|revok|suspend/i],
  ["Effective date", /effective|takes effect|sunset|expire|chapter/i],
];
function renderCompare() {
  const bills = compareSet.map((id) => billById[id]).filter(Boolean);
  const m = ws.models[topic === "all" ? "sports" : topic] || { title: "", text: "" };
  if (m.text && compareModel) ensureTexts();
  const NA = "Not addressed";
  const rows = [
    ["Stage", (b) => `${stageOf(b)}${b.last_action_date ? ` · ${fmtShort(b.last_action_date)}` : ""}${b.status === 4 ? " · signed into law" : ""}`, "—"],
    ["What it does", (b) => ANALYSIS[b.id]?.summary || b.description || NA, m.text ? m.title || "Your model bill" : "[Paste a model bill in Clients → Model bill]"],
    ...PROVISIONS.map(([label, re]) => [label, (b) => { const hits = (ANALYSIS[b.id]?.mechanics || []).filter((x) => re.test(x)); return hits.length ? `<ul>${hits.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : NA; }, m.text ? (sentences(m.text).filter((x) => re.test(x)).slice(0, 2).join(" ") || NA) : "[Your provision]", true]),
    ["Issues", (b) => issuesOf(b).map((t) => lensLabel(b.topics[0], t)).join(", ") || NA, "—"],
    ["Versus other states", (b) => ANALYSIS[b.id]?.comparison || NA, "—"],
    ["Watch", (b) => ANALYSIS[b.id]?.watch || NA, "—"],
    ["Sponsor", (b) => { const s = (b.sponsors || []).find((x) => x.primary) || b.sponsors?.[0]; const r = s && SPONSORS[s.people_id]; return s ? `${s.name}${s.party ? ` (${s.party})` : ""}${r ? ` · ${r.passed_chamber} of ${r.bills_total} bills passed a chamber` : ""}` : NA; }, "—"],
    ["Positions", (b) => posSummary(b) || NA, "—"],
    ["Model bill coverage", (b) => { const t = textOf(b); if (!m.text) return NA; if (!t) return "Text not loaded"; const c = modelCoverage(m.text, t); return `${Math.round(c.coverage * 100)}% of model language present${c.missing.length ? `; missing: ${c.missing.slice(0, 3).map((x) => x.slice(0, 90) + "…").join(" / ")}` : ""}`; }, "100%"],
  ];
  const candidates = showAddBill ? moved().filter(matches).sort(byMovement).slice(0, 60) : [];
  document.getElementById("app").innerHTML = `${header("compare", true)}
  <main class="compare">
    <div class="cmp-bar"><span class="kicker">Comparing</span>${bills.map((b) => `<span class="sel">${b.state} ${esc(b.number)}<button data-rmcmp="${b.id}" aria-label="Remove ${esc(b.number)}">×</button></span>`).join("")}
      <span class="picker"><button class="btn dashed" id="addbill">+ Add a bill</button>${showAddBill ? `<div class="menu">${candidates.map((b) => `<button data-addcmp="${b.id}"><b>${b.state} ${esc(b.number)}</b> · ${esc(headline(b).slice(0, 70))}</button>`).join("") || `<button disabled>Type in search to find bills</button>`}</div>` : ""}</span>
      <span class="spacer"></span><label><input type="checkbox" id="diff" ${compareDiff ? "checked" : ""}>Only rows that differ</label><label><input type="checkbox" id="withmodel" ${compareModel ? "checked" : ""}>Include model bill</label>${ws.folders.length ? `<select class="input" id="savefolder" style="width:auto"><option value="">Save to folder…</option>${ws.folders.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select>` : ""}</div>
    ${bills.length ? `<div class="scrollx"><table class="cmp"><thead><tr><th></th>${bills.map((b) => `<th><div class="kicker">${NAMES[b.state]} · ${esc(b.number)}</div><a href="#/bill/${encodeURIComponent(b.id)}">${esc(headline(b))}</a></th>`).join("")}${compareModel ? `<th class="model"><div class="kicker muted">Your model bill</div><div class="nm">${esc(m.title || "[Model bill name]")}</div></th>` : ""}</tr></thead>
      <tbody>${rows.map(([k, fn, mv, html]) => { const vals = bills.map(fn); if (compareDiff && bills.length > 1 && vals.every((v) => v === vals[0])) return ""; return `<tr><th scope="row">${k}</th>${vals.map((v) => `<td class="${v === NA ? "na" : ""}">${html ? v : esc(v)}</td>`).join("")}${compareModel ? `<td class="model">${esc(mv)}</td>` : ""}</tr>`; }).join("")}</tbody></table></div>
      <div class="muted" style="font-size:12.5px">Built from AI summaries of each bill's text. “Not addressed” means there is no summary or the summary doesn't mention it; check the full text before relying on it.</div>`
      : `<div class="empty">Pick two or more bills: select them on the map and choose Compare, or use “+ Add a bill”.</div>`}
  </main>`;
  const app = document.getElementById("app");
  wireChrome(app);
  app.querySelectorAll("[data-rmcmp]").forEach((btn) => btn.addEventListener("click", () => { compareSet = compareSet.filter((x) => x !== btn.dataset.rmcmp); save("statecraft.compare", compareSet); render(); }));
  app.querySelector("#addbill").addEventListener("click", () => { showAddBill = !showAddBill; render(); });
  app.querySelectorAll("[data-addcmp]").forEach((btn) => btn.addEventListener("click", () => { compareSet = [...new Set([...compareSet, btn.dataset.addcmp])].slice(-4); save("statecraft.compare", compareSet); showAddBill = false; render(); }));
  app.querySelector("#diff").addEventListener("change", (e) => { compareDiff = e.target.checked; render(); });
  app.querySelector("#withmodel").addEventListener("change", (e) => { compareModel = e.target.checked; render(); });
  app.querySelector("#savefolder")?.addEventListener("change", (e) => { const f = folderById(e.target.value); if (f) { for (const id of compareSet) if (!f.billIds.includes(id)) f.billIds.push(id); persist(); go(`#/folders/${f.id}`); } });
}

// =============== CLIENTS ===============
function renderClients(id) {
  const c = clientById(id) || ws.clients[0];
  const rowsFor = (cl) => ALL_BILLS.filter((b) => posOf(b).some((p) => p.clientId === cl.id)).map((b) => ({ b, p: posOf(b).find((p) => p.clientId === cl.id) })).sort((x, y) => byMovement(x.b, y.b));
  const rows = c ? rowsFor(c) : [];
  const tally = c ? STANCES.map((s) => [s, rows.filter((r) => r.p.stance === s).length]) : [];
  const todo = c ? moved().filter((b) => !c.topics.length || b.topics.some((t) => c.topics.includes(t))).filter((b) => !posOf(b).some((p) => p.clientId === c.id)).filter((b) => relevance(b) === 0).sort(byMovement).slice(0, 8) : [];
  const mkey = topic === "all" ? "sports" : topic, m = ws.models[mkey] || { title: "", text: "" };
  document.getElementById("app").innerHTML = `${header("clients")}
  <div class="split">
    <nav class="sidenav" aria-label="Clients"><form id="newclient" style="display:flex;flex-direction:column;gap:6px"><button class="btn solid" type="button" id="newbtn">+ Add client</button><div id="newfields" hidden style="display:flex;flex-direction:column;gap:6px"><input class="input" name="name" list="stakeholders" placeholder="Client name" required><button class="btn sm">Create</button></div></form>
      ${ws.clients.map((x) => { const r = rowsFor(x); return `<a class="client ${c && x.id === c.id ? "on" : ""}" href="#/clients/${x.id}"><div class="nm">${esc(x.name)}</div><div class="sub">${esc(x.topics.map((t) => DATA.topics[t]).filter(Boolean).join(" · ") || "All topics")}</div><div class="ct">${r.length} position${r.length === 1 ? "" : "s"} · ${ws.folders.filter((f) => f.clientId === x.id).length} folder${ws.folders.filter((f) => f.clientId === x.id).length === 1 ? "" : "s"}</div></a>`; }).join("") || `<p class="muted" style="font-size:13px">Add a client, or record a position on any bill and the client is created for you.</p>`}</nav>
    <main class="content">${c ? `
      <div class="titlebar double"><div><div class="kicker">Client</div><h1><input id="cname" value="${esc(c.name)}" aria-label="Client name"></h1><div class="pills">${Object.entries(DATA.topics).map(([k, l]) => `<button class="tag" data-ctopic="${k}" style="${c.topics.includes(k) ? "" : "opacity:.45"}">${esc(l)}</button>`).join("")}<button class="btn sm" id="delclient" style="color:var(--red);border:0">Remove client</button></div></div>
        <div class="tally">${tally.map(([s, n]) => `<div><div class="n" style="color:${{ Support: "var(--green)", Oppose: "var(--red)", Amend: "var(--amber)", Watch: "var(--ink)" }[s]}">${n}</div><div class="l">${s}</div></div>`).join("")}</div></div>
      <section><h2 style="font-size:24px;margin-bottom:8px">Positions</h2><div class="scrollx"><table class="grid"><thead><tr><th>Bill</th><th>Position</th><th>Note</th><th>Folder</th><th>Stage</th></tr></thead><tbody>
        ${rows.map(({ b, p }) => `<tr><td><a class="num" href="#/bill/${encodeURIComponent(b.id)}">${b.state} ${esc(b.number)}</a><div class="t">${esc(headline(b))}</div></td><td><select class="stance ${p.stance.toLowerCase()}" data-chg="${b.id}" aria-label="Position on ${esc(b.number)}">${STANCES.map((s) => `<option ${s === p.stance ? "selected" : ""}>${s}</option>`).join("")}</select></td><td style="font-size:13.5px;color:var(--ink-2)">${esc(p.note)}</td><td style="font-size:13px">${foldersOf(b).map((f) => `<a href="#/folders/${f.id}">${esc(f.name)}</a>`).join(", ") || "—"}</td><td class="muted" style="font-size:13px">${esc(stageOf(b))}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No positions recorded yet.</td></tr>`}</tbody></table></div></section>
      <section class="card"><div class="list-head"><h2 style="font-size:22px">Moving bills with no position yet</h2><span class="muted" style="font-size:13px">Matched to this client's topics</span></div>
        ${todo.map((b) => `<div class="todo-row"><a class="num" href="#/bill/${encodeURIComponent(b.id)}">${b.state} ${esc(b.number)}</a><span class="t">${esc(headline(b))}</span><span class="stage">${esc(stageOf(b))}</span><span class="seg sm">${["Support", "Oppose", "Watch"].map((s) => `<button data-quick="${b.id}|${s}">${s}</button>`).join("")}</span></div>`).join("") || `<p class="muted" style="font-size:13px">Nothing outstanding.</p>`}</section>
      <section class="card"><h2 style="font-size:22px;margin-bottom:6px">Model bill · ${esc(DATA.topics[mkey])}</h2><p class="muted" style="font-size:13px;margin:0 0 10px">Used by Compare and by each bill's model-coverage row. Stored only in this browser.</p><form id="modelform" style="display:flex;flex-direction:column;gap:8px"><input class="input" name="title" placeholder="Name, e.g. Model Sports Wagering Act" value="${esc(m.title)}"><textarea class="input" name="text" style="font-family:var(--sans);font-size:13px;min-height:140px" placeholder="Paste model bill text…">${esc(m.text)}</textarea><div style="display:flex;gap:8px"><button class="btn solid sm">Save model bill</button>${m.text ? `<button type="button" class="btn sm" id="clearmodel">Clear</button>` : ""}</div></form></section>`
      : `<div class="empty">No clients yet.</div>`}</main></div>`;
  const app = document.getElementById("app");
  wireChrome(app);
  app.querySelector("#newbtn").addEventListener("click", () => { const d = app.querySelector("#newfields"); d.hidden = !d.hidden; });
  app.querySelector("#newclient").addEventListener("submit", (e) => { e.preventDefault(); const nc = ensureClient(e.target.name.value.trim()); persist(); go(`#/clients/${nc.id}`); });
  app.querySelector("#modelform")?.addEventListener("submit", (e) => { e.preventDefault(); ws.models[mkey] = { title: e.target.title.value.trim(), text: e.target.text.value }; persist(); render(); });
  app.querySelector("#clearmodel")?.addEventListener("click", () => { ws.models[mkey] = { title: "", text: "" }; persist(); render(); });
  if (!c) return;
  app.querySelector("#cname").addEventListener("change", (e) => { c.name = e.target.value.trim() || c.name; persist(); render(); });
  app.querySelectorAll("[data-ctopic]").forEach((btn) => btn.addEventListener("click", () => { const k = btn.dataset.ctopic; c.topics = c.topics.includes(k) ? c.topics.filter((x) => x !== k) : [...c.topics, k]; persist(); render(); }));
  app.querySelector("#delclient").addEventListener("click", () => { if (confirm(`Remove ${c.name} and their positions?`)) { ws.clients = ws.clients.filter((x) => x.id !== c.id); for (const k of Object.keys(ws.positions)) { ws.positions[k] = ws.positions[k].filter((p) => p.clientId !== c.id); if (!ws.positions[k].length) delete ws.positions[k]; } for (const f of ws.folders) if (f.clientId === c.id) f.clientId = null; persist(); go("#/clients"); } });
  app.querySelectorAll("[data-chg]").forEach((sel) => sel.addEventListener("change", () => { const p = posOf(billById[sel.dataset.chg]).find((x) => x.clientId === c.id); p.stance = sel.value; p.updated = TODAY; persist(); render(); }));
  app.querySelectorAll("[data-quick]").forEach((btn) => btn.addEventListener("click", () => { const [id, s] = btn.dataset.quick.split("|"); (ws.positions[id] ||= []).push({ clientId: c.id, stance: s, note: "", updated: TODAY }); persist(); render(); }));
}

// ---- render ----
function render() {
  const { page, id } = route();
  if (page === "bill") renderBill(id);
  else if (page === "folders") renderFolders(id);
  else if (page === "compare") renderCompare();
  else if (page === "clients") renderClients(id);
  else renderMap();
  window.scrollTo(0, 0);
}
render();
window.addEventListener("resize", () => { if (route().page === "map") drawMap(); });
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === "/" && !typing) { const s = document.querySelector("#q"); if (s) { e.preventDefault(); s.focus(); } }
  if (e.key === "Escape" && (showFolderPicker || showPositionPicker || showAddBill || shareOpen || settingsOpen || helpOpen)) { showFolderPicker = showPositionPicker = showAddBill = shareOpen = settingsOpen = helpOpen = false; render(); }
});
