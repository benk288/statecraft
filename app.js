// Statecraft v3 — sports betting legislative radar for a regulatory practice.
// Three panes: map · bill list · bill detail. Reads static snapshots
// (data/bills.js, data/analysis.js, data/sponsors.js); no network at runtime.
// Positions and the model bill are saved in this browser only.

const DATA = window.STATECRAFT_DATA || { bills: [] };
const BILLS = DATA.bills || [];
const ANALYSIS = window.STATECRAFT_ANALYSIS || {};
const SPONSORS = window.STATECRAFT_SPONSORS || {};

const FIPS = {"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY","72":"PR"};
const NAMES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",PR:"Puerto Rico"};
const CHAMBER_LABEL = (st, ch) => st === "NE" ? "Legislature" : ch === "H" ? (["CA","NY","NJ","NV","WI"].includes(st) ? "Assembly" : "House") : ch === "S" ? "Senate" : "Other";

// ---- issue taxonomy, in the practice's priority order ----
const ISSUES = [
  { key: "tax", label: "Tax rate", re: /\btax(es|ation|ed)?\b|gross (gaming|wagering) revenue|privilege fee|excise/i },
  { key: "prediction", label: "Prediction markets", re: /prediction market|event contract|futures|cftc|derivative/i },
  { key: "advertising", label: "Advertising", re: /advertis|marketing|promotion|inducement|bonus|push notification|influencer/i },
  { key: "prop", label: "Prop / college bets", re: /\bprop\b|proposition (bet|wager)|college|collegiate|student[- ]athlete|ncaa|amateur/i },
  { key: "sweeps", label: "Sweepstakes", re: /sweepstake|social casino|dual[- ]currency|skill game|gray market/i },
  { key: "licensing", label: "Licensing", re: /licens|permit|operator|vendor|supplier|registration|fee/i },
  { key: "legalize", label: "Legalization / mobile", re: /authoriz|legaliz|mobile|online|internet|interactive|establish(es|ing)? .*wager|sports wagering act/i },
  { key: "integrity", label: "Consumer / integrity", re: /self[- ]exclusion|problem gambling|responsible|addiction|minor|age verification|integrity|limit/i },
];
const ISSUE_LABEL = Object.fromEntries(ISSUES.map((i) => [i.key, i.label]));
// Prefer Claude's reading of the text when we have it; fall back to title keywords.
const issuesOf = (b) => ANALYSIS[b.id]?.issue_tags?.length ? ANALYSIS[b.id].issue_tags : ISSUES.filter((i) => i.re.test(`${b.title} ${b.description || ""}`)).map((i) => i.key);

// ---- movement: an introduction is not news; leaving committee or reaching the floor is ----
function movement(b) {
  const a = (b.last_action || "").toLowerCase();
  if (b.status === 4) return { level: 3, label: "Signed into law" };
  if (b.status === 5) return { level: 3, label: "Vetoed" };
  if (b.status === 3) return { level: 3, label: "Passed both chambers" };
  if (/died|lost|failed|withdrawn|tabled indefinitely|postponed indefinitely/.test(a)) return { level: 0, label: "" };
  if (/third reading|floor|conference|concur|enrolled|passed|final passage|adopted/.test(a) || b.status === 2) return { level: 3, label: "Floor action" };
  if (/calendar|second reading|placed on|ordered engrossed|eligible/.test(a)) return { level: 2, label: "On the calendar" };
  if (/reported|do pass|recommend|favorabl|amend|substitute|voted out|committee (report|substitute)/.test(a)) return { level: 2, label: "Out of committee" };
  if (/hearing|scheduled|heard/.test(a)) return { level: 1, label: "Hearing" };
  return { level: 0, label: "" };
}
const isActive = (b) => b.status >= 0 && b.status <= 3;
const fmtDate = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const relevance = (b) => ({ core: 0, partial: 1, incidental: 2 })[ANALYSIS[b.id]?.relevance] ?? (/sport|wager|bet|gambl|gaming|lottery|casino|prediction/i.test(b.title) ? 0 : 1);
const byDateDesc = (a, b) => (b.last_action_date || "").localeCompare(a.last_action_date || "");
const byMovement = (a, b) => movement(b).level - movement(a).level || relevance(a) - relevance(b) || byDateDesc(a, b);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- browser-local state: positions and the model bill ----
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let positions = store("statecraft.positions.v1", {});
let modelBill = store("statecraft.modelbill.v1", { title: "", text: "" });
const posOf = (b) => positions[b.id] || [];
const STANCES = ["Oppose", "Support", "Monitor", "Amend"];

// ---- official links ----
const BAD_URL = /^ftp:|wsdl|bill-search$|billsearch|prefiledBills|loadBillsIntroduced|search_by_date|status\.rilegislature\.gov\/?$|FTPDocument|legislation\.nysenate\.gov\/api/;
function officialUrl(b) {
  const num = b.number.replace(/\s+/g, ""), year = (b.session.match(/\d{4}/) || [""])[0];
  const builders = {
    NY: () => `https://www.nysenate.gov/legislation/bills/${year}/${num}`,
    TX: () => { const m = (b.url || "").match(/\/bills\/(\d+R)\//); return m ? `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=${m[1]}&Bill=${num}` : null; },
    CT: () => `https://www.cga.ct.gov/asp/cgabillstatus/cgabillstatus.asp?selBillType=Bill&bill_num=${num}&which_year=${year}`,
    IA: () => `https://www.legis.iowa.gov/legislation/BillBook?ga=91&ba=${num}`,
    VT: () => `https://legislature.vermont.gov/bill/status/${year}/${b.number.replace(/\s+/g, ".")}`,
  };
  if (b.url && !BAD_URL.test(b.url)) return b.url;
  return builders[b.state]?.() || b.legiscan_url || b.url;
}

// ---- app state ----
const byState = {};
for (const b of BILLS) (byState[b.state] ||= []).push(b);
const billById = Object.fromEntries(BILLS.map((b) => [b.id, b]));
let view = "moved";          // moved | positions | model | brief
let selectedState = null;
let selectedBill = null;
let filter = { chamber: "ALL", activeOnly: true, q: "", issue: "ALL" };
const matchesIssue = (b) => filter.issue === "ALL" || issuesOf(b).includes(filter.issue);
const stateBills = (st) => (byState[st] || []).filter(matchesIssue);
const activeCount = (st) => stateBills(st).filter(isActive).length;
const movedBills = () => BILLS.filter(matchesIssue).filter(isActive).filter((b) => movement(b).level >= 2).sort(byMovement);

// ---- header ----
const analysed = Object.keys(ANALYSIS).length;
document.getElementById("meta").innerHTML = DATA.generated
  ? `<b>${BILLS.length}</b> bills · <b>${Object.keys(byState).length}</b> states${analysed ? ` · <b>${analysed}</b> AI-analysed` : ""}<br>Snapshot ${new Date(DATA.generated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
  : `No bill snapshot loaded yet.`;

function renderViews() {
  const taggedCount = Object.keys(positions).filter((id) => positions[id].length).length;
  const items = [["moved", "What moved", movedBills().length], ["positions", "Client positions", taggedCount], ["model", "Model bill", modelBill.text ? "✓" : ""], ["brief", "Morning brief", ""]];
  document.getElementById("views").innerHTML = items.map(([k, l, n]) => `<button data-view="${k}" class="${view === k ? "on" : ""}">${l}${n !== "" ? `<span class="n">${n}</span>` : ""}</button>`).join("");
  document.querySelectorAll("#views button").forEach((btn) => btn.addEventListener("click", () => { view = btn.dataset.view; selectedBill = null; if (view !== "moved") selectedState = null; render(); }));
}

// ---- map ----
const svg = d3.select("#map"), wrap = document.getElementById("map-pane"), tip = document.getElementById("tip");
const states = topojson.feature(window.US_STATES, window.US_STATES.objects.states).features.filter((f) => FIPS[f.id] && FIPS[f.id] !== "PR");
const color = d3.scaleThreshold().domain([1, 3, 6, 12]).range(["var(--map-0)", "var(--map-1)", "var(--map-2)", "var(--map-3)", "var(--map-4)"]);
function drawMap() {
  const { width, height } = wrap.getBoundingClientRect();
  if (!width) return;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  const projection = d3.geoAlbersUsa().fitExtent([[16, 56], [width - 16, height - 16]], { type: "FeatureCollection", features: states });
  const path = d3.geoPath(projection);
  svg.selectAll("path.state").data(states, (f) => f.id).join("path")
    .attr("class", (f) => "state" + (FIPS[f.id] === selectedState ? " selected" : ""))
    .attr("d", path).attr("fill", (f) => color(activeCount(FIPS[f.id])))
    .on("mousemove", (ev, f) => showTip(ev, FIPS[f.id])).on("mouseleave", () => (tip.style.display = "none"))
    .on("click", (ev, f) => selectState(FIPS[f.id]));
  svg.selectAll("path.state").filter((f) => FIPS[f.id] === selectedState).raise();
}
function showTip(ev, st) {
  const bills = stateBills(st), active = bills.filter(isActive);
  const h = active.filter((b) => b.chamber === "H").length, s = active.filter((b) => b.chamber === "S").length;
  const moved = active.filter((b) => movement(b).level >= 2).length, tagged = bills.filter((b) => posOf(b).length).length;
  const r = wrap.getBoundingClientRect();
  tip.style.display = "block";
  tip.innerHTML = `<div class="name">${NAMES[st]}</div><div>${active.length} active bill${active.length === 1 ? "" : "s"}${filter.issue !== "ALL" ? ` on ${ISSUE_LABEL[filter.issue].toLowerCase()}` : ""} <span class="sub">(${bills.length} tracked)</span></div>
    <div class="sub">${st === "NE" ? `${active.length} Legislature` : `${h} ${CHAMBER_LABEL(st, "H")} · ${s} Senate`}</div>
    ${moved ? `<div class="sub">${moved} out of committee or on the floor</div>` : ""}${tagged ? `<div class="sub">${tagged} with client positions</div>` : ""}
    <div class="hint">Click to open ${st} docket →</div>`;
  tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - tip.offsetWidth - 10) + "px";
  tip.style.top = Math.min(ev.clientY - r.top + 14, r.height - tip.offsetHeight - 10) + "px";
}
function drawLegend() {
  const d = color.domain(), rows = [["No active bills", color(0)]];
  for (let i = 0; i < d.length; i++) rows.push([d[i + 1] ? `${d[i]}–${d[i + 1] - 1} active` : `${d[i]}+ active`, color(d[i])]);
  document.getElementById("legend").innerHTML = `<b>Active bills${filter.issue !== "ALL" ? ": " + ISSUE_LABEL[filter.issue] : ""}</b>` + rows.map(([l, c]) => `<div class="lrow"><span class="sw" style="background:${c}"></span>${l}</div>`).join("") + `<div class="lrow"><span class="sw" style="background:var(--hover)"></span>Hover to inspect</div>`;
}
const lens = document.getElementById("lens");
lens.innerHTML = `<label for="issue">Issue lens</label><select id="issue"><option value="ALL">All sports-betting bills</option>${ISSUES.map((i) => `<option value="${i.key}">${i.label}</option>`).join("")}</select>`;
lens.querySelector("#issue").addEventListener("change", (e) => { filter.issue = e.target.value; render(); });

function selectState(st) { selectedState = st === selectedState ? null : st; view = "moved"; selectedBill = null; render(); }
function selectBill(id) { selectedBill = id; render(); }

// ---- list pane ----
const listPane = document.getElementById("list-pane");
function row(b, showState) {
  const mv = movement(b), ai = ANALYSIS[b.id], pos = posOf(b);
  return `<button class="row${mv.level >= 2 ? " moved" : ""}${selectedBill === b.id ? " on" : ""}" data-bill="${b.id}">
    <div class="top">${showState ? `<span class="state-tag">${b.state}</span>` : ""}<span class="num">${esc(b.number)}</span>
      <span class="badge s${b.status}">${esc(b.status_text)}</span>${mv.label && b.status < 3 ? `<span class="badge mv${mv.level}">${esc(mv.label)}</span>` : ""}
      ${pos.length ? `<span class="pos-dots">${pos.map((p) => `<span class="dot ${p.stance.toLowerCase()}" title="${esc(p.who)}: ${esc(p.stance)}"></span>`).join("")}</span>` : ""}</div>
    <div class="title">${esc(ai?.summary ? ai.summary.split(". ")[0] + "." : b.title)}</div>
    <div class="action">${fmtDate(b.last_action_date)} · ${esc(b.last_action.slice(0, 90))}</div></button>`;
}
function applyFilter(list) {
  return list.filter((b) => matchesIssue(b) && (filter.chamber === "ALL" || b.chamber === filter.chamber) && (!filter.activeOnly || isActive(b)) &&
    (!filter.q || `${b.number} ${b.title} ${b.description} ${b.last_action} ${(b.sponsors || []).join(" ")} ${posOf(b).map((p) => p.who + " " + p.stance).join(" ")} ${ANALYSIS[b.id]?.summary || ""}`.toLowerCase().includes(filter.q)));
}
function controls(showChamber) {
  return `<div class="controls">${showChamber ? `<div class="tabs" id="chamber"><button data-c="ALL" class="${filter.chamber === "ALL" ? "on" : ""}">All</button><button data-c="H" class="${filter.chamber === "H" ? "on" : ""}">${esc(CHAMBER_LABEL(selectedState, "H"))}</button><button data-c="S" class="${filter.chamber === "S" ? "on" : ""}">Senate</button></div>` : ""}
    <input type="search" id="q" placeholder="Search bills, sponsors, clients…" value="${esc(filter.q)}"><label><input type="checkbox" id="active" ${filter.activeOnly ? "checked" : ""}> Active only</label></div>`;
}
function renderList() {
  if (!BILLS.length) { listPane.innerHTML = `<div class="empty">No bill snapshot is loaded.</div>`; return; }
  let html;
  if (view === "positions") {
    const tagged = applyFilter(BILLS.filter((b) => posOf(b).length)).sort(byMovement);
    const who = new Set(tagged.flatMap((b) => posOf(b).map((p) => p.who)));
    html = `<div class="pane-head"><h2>Client positions</h2><div class="sub">${tagged.length} bill${tagged.length === 1 ? "" : "s"} · ${who.size} stakeholder${who.size === 1 ? "" : "s"}</div>
      <div class="stats">${STANCES.slice(0, 3).map((s) => `<div class="stat"><div class="n">${tagged.filter((b) => posOf(b).some((p) => p.stance === s)).length}</div><div class="l">${s}</div></div>`).join("")}</div></div>
      ${controls(false)}<div class="list">${tagged.map((b) => row(b, true)).join("") || `<div class="empty">No positions yet. Open any bill and click “Add position”.</div>`}</div>
      <div class="notice">Positions stay in this browser. Use fictional client names for demos.</div>`;
  } else if (view === "model") {
    const scored = modelBill.text ? BILLS.filter((b) => textOf(b)).map((b) => ({ b, c: compare(modelBill.text, textOf(b)) })).sort((x, y) => y.c.coverage - x.c.coverage) : [];
    html = `<div class="pane-head"><h2>Model bill</h2><div class="sub">${modelBill.text ? `Bills ranked by how much of your model language they contain` : "Paste your model legislation on the right to compare bills against it"}</div></div>
      <div class="list">${scored.slice(0, 60).map(({ b, c }) => row(b, true).replace('<div class="action">', `<div class="action"><b>${Math.round(c.coverage * 100)}% of model covered</b> · `)).join("") || `<div class="empty">${modelBill.text ? "No bill texts loaded." : "Nothing to rank yet."}</div>`}</div>`;
  } else if (view === "brief") {
    html = `<div class="pane-head"><h2>Morning brief</h2><div class="sub">A printable page of what moved, by issue and state, with your positions</div></div><div class="empty">The brief is on the right. Use <span class="kbd">⌘P</span> to print or save as PDF; only the brief prints.</div>`;
  } else if (selectedState) {
    const bills = byState[selectedState] || [], active = bills.filter(matchesIssue).filter(isActive);
    const list = applyFilter(bills).sort(byMovement);
    const h = active.filter((b) => b.chamber === "H").length, s = active.filter((b) => b.chamber === "S").length;
    html = `<div class="pane-head"><button class="back" id="back">← All states</button><h2>${NAMES[selectedState]}</h2><div class="sub">${bills.length} bills tracked · ${esc(bills[0]?.session || "")} · sorted by movement</div>
      <div class="stats"><div class="stat"><div class="n">${active.length}</div><div class="l">Active</div></div><div class="stat"><div class="n">${selectedState === "NE" ? active.length : h}</div><div class="l">${esc(CHAMBER_LABEL(selectedState, "H"))}</div></div><div class="stat"><div class="n">${selectedState === "NE" ? "—" : s}</div><div class="l">Senate</div></div></div></div>
      ${controls(selectedState !== "NE")}<div class="list">${list.map((b) => row(b)).join("") || `<div class="empty">No bills match the current filters.</div>`}</div>`;
  } else {
    const moved = movedBills(), pool = BILLS.filter(matchesIssue), active = pool.filter(isActive);
    const enacted = pool.filter((b) => b.status === 4).sort((a, b) => relevance(a) - relevance(b) || byDateDesc(a, b));
    const results = filter.q ? applyFilter(BILLS).sort(byMovement) : null;
    html = `<div class="pane-head"><h2>What moved</h2><div class="sub">Bills out of committee, on a calendar, or past a floor vote${filter.issue !== "ALL" ? ` · ${ISSUE_LABEL[filter.issue]}` : ""}</div>
      <div class="stats"><div class="stat"><div class="n">${moved.length}</div><div class="l">Moved</div></div><div class="stat"><div class="n">${active.length}</div><div class="l">Active</div></div><div class="stat"><div class="n">${new Set(active.map((b) => b.state)).size}</div><div class="l">States</div></div></div></div>
      ${controls(false)}<div class="list">${results ? `<div class="section-title">Search results (${results.length})</div>${results.slice(0, 80).map((b) => row(b, true)).join("") || `<div class="empty">No bills match.</div>`}`
        : `<div class="section-title">Moving now (${moved.length})</div>${moved.map((b) => row(b, true)).join("")}<div class="section-title">Signed into law this session (${enacted.length})</div>${enacted.slice(0, 40).map((b) => row(b, true)).join("")}`}</div>`;
  }
  listPane.innerHTML = html;
  listPane.querySelector("#back")?.addEventListener("click", () => selectState(selectedState));
  listPane.querySelectorAll("[data-bill]").forEach((el) => el.addEventListener("click", () => selectBill(el.dataset.bill)));
  listPane.querySelectorAll("#chamber button").forEach((btn) => btn.addEventListener("click", () => { filter.chamber = btn.dataset.c; render(); }));
  listPane.querySelector("#active")?.addEventListener("change", (e) => { filter.activeOnly = e.target.checked; render(); });
  listPane.querySelector("#q")?.addEventListener("input", (e) => { filter.q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; renderList(); const nq = listPane.querySelector("#q"); nq.focus(); nq.setSelectionRange(pos, pos); });
}

// ---- model-bill comparison (client-side text matching) ----
const textCache = {};
function textOf(b) { return window.STATECRAFT_TEXTS?.[b.id] ?? textCache[b.id] ?? null; }
const STOP = new Set("the of and to a in for or by an be is are as that this with shall on at any such from which not may under its it will their".split(" "));
const tokens = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
function sentences(text) { return text.replace(/\s+/g, " ").split(/(?<=[.;])\s+(?=[A-Z(§\d])/).map((s) => s.trim()).filter((s) => s.length > 40 && s.length < 600); }
function compare(model, bill) {
  const ms = sentences(model), bs = sentences(bill);
  const bsets = bs.map((s) => new Set(tokens(s)));
  const scoreOf = (set, other) => { let inter = 0; for (const w of set) if (other.has(w)) inter++; return inter / Math.max(1, Math.min(set.size, other.size)); };
  const covered = [], missing = [], usedBill = new Set();
  for (const s of ms) {
    const set = new Set(tokens(s)); let best = 0, bi = -1;
    bsets.forEach((o, i) => { const sc = scoreOf(set, o); if (sc > best) { best = sc; bi = i; } });
    if (best >= 0.6) { covered.push({ model: s, bill: bs[bi], score: best }); usedBill.add(bi); } else missing.push({ model: s, bill: bi >= 0 && best >= 0.35 ? bs[bi] : null, score: best });
  }
  const added = bs.filter((_, i) => !usedBill.has(i)).filter((s) => /shall|must|prohibit|require|tax|license|percent|%/i.test(s)).slice(0, 25);
  return { covered, missing, added, coverage: ms.length ? covered.length / ms.length : 0 };
}

// ---- detail pane ----
const detailPane = document.getElementById("detail-pane");
function positionsCard(b) {
  const list = posOf(b);
  return `<div class="card"><h3>Client &amp; stakeholder positions</h3><div class="positions">
    ${list.map((p, i) => `<span class="pos ${p.stance.toLowerCase()}">${esc(p.who)}: ${esc(p.stance)}${p.note ? ` — ${esc(p.note)}` : ""}<button class="x" data-del="${i}" title="Remove">×</button></span>`).join("")}
    <button class="btn dashed" id="addpos">+ Add position</button></div>
    <form class="posform" id="posform" hidden><input name="who" placeholder="Client / stakeholder" required><select name="stance">${STANCES.map((s) => `<option>${s}</option>`).join("")}</select><input name="note" placeholder="Note (optional)"><button class="btn primary" type="submit">Save</button></form></div>`;
}
function sponsorCard(b) {
  const sp = Object.values(SPONSORS).filter((s) => s.bills_here?.includes(`${b.state} ${b.number}`));
  if (!sp.length) return b.sponsors?.length ? `<div class="card"><h3>Sponsors</h3><p>${esc(b.sponsors.join(", "))}</p></div>` : "";
  return `<div class="card"><h3>Sponsor research <span class="badge ai">from legislative records</span></h3>${sp.map((s) => `<div class="sponsor">
    <div><div class="name">${esc(s.name)}</div><div class="sub">${esc([s.party, s.title, s.district ? "District " + s.district : null].filter(Boolean).join(" · "))} · <a href="${esc(s.openstates_url)}" target="_blank" rel="noopener">record ↗</a></div>
      ${s.sample?.length ? `<div class="sub" style="margin-top:6px">Also carrying: ${esc(s.sample.slice(0, 3).map((x) => x.split(":")[0]).join(", "))}</div>` : ""}</div>
    <div class="nums"><div><div class="n">${s.bills_total}</div><div class="l">Bills</div></div><div><div class="n">${s.passed_chamber}${s.bills_total > s.bills_counted ? "+" : ""}</div><div class="l">Passed a chamber</div></div><div><div class="n">${s.enacted}${s.bills_total > s.bills_counted ? "+" : ""}</div><div class="l">Enacted</div></div></div></div>`).join("<hr style='border:0;border-top:1px solid var(--line);margin:12px 0'>")}
    <p class="sub" style="font-size:12px;color:var(--muted);margin-top:10px">Counts are this session's bills where they are primary sponsor${sp.some((s) => s.bills_total > s.bills_counted) ? " (first 60 checked)" : ""}.</p></div>`;
}
function modelCard(b) {
  const t = textOf(b);
  if (!modelBill.text) return `<div class="card"><h3>Model bill comparison</h3><p style="color:var(--muted)">Paste your model legislation under <b>Model bill</b> in the top bar to compare this bill against it.</p></div>`;
  if (!t) return `<div class="card"><h3>Model bill comparison</h3><p style="color:var(--muted)">Full text not in the snapshot for this bill (texts are pulled for bills that have moved).</p></div>`;
  const c = compare(modelBill.text, t);
  return `<div class="card"><h3>Model bill comparison <span class="badge ai">text match</span></h3>
    <div class="cmp-stats"><div class="stat"><div class="n">${Math.round(c.coverage * 100)}%</div><div class="l">Model covered</div></div><div class="stat"><div class="n">${c.missing.length}</div><div class="l">Model provisions missing</div></div><div class="stat"><div class="n">${c.added.length}</div><div class="l">Bill-only provisions</div></div></div>
    ${c.missing.length ? `<h3>Missing from this bill</h3><ul class="cmp-list missing">${c.missing.slice(0, 12).map((m) => `<li>${esc(m.model)}${m.bill ? `<div class="q">Closest in bill: ${esc(m.bill)}</div>` : ""}</li>`).join("")}</ul>` : ""}
    ${c.added.length ? `<h3 style="margin-top:12px">In this bill, not in the model</h3><ul class="cmp-list added">${c.added.slice(0, 10).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
    ${c.covered.length ? `<h3 style="margin-top:12px">Matches the model (${c.covered.length})</h3><ul class="cmp-list covered">${c.covered.slice(0, 6).map((m) => `<li>${esc(m.model)}</li>`).join("")}</ul>` : ""}</div>`;
}
function renderDetail() {
  if (view === "model" && !selectedBill) return renderModelEditor();
  if (view === "brief") return renderBrief();
  const b = billById[selectedBill];
  if (!b) {
    const moved = movedBills();
    detailPane.innerHTML = `<div class="detail"><h2>Good morning.</h2><p class="titleline">${moved.length} sports-betting bills are moving across ${new Set(moved.map((x) => x.state)).size} states. Pick a bill on the left, or hover the map for a state's docket.</p>
      <div class="card"><h3>How to read this</h3><ul><li><b>What moved</b> lists only bills that left committee, reached a calendar, or had a floor vote. Introductions are hidden by default.</li><li>The <b>issue lens</b> on the map re-shades states by one topic, in your priority order.</li><li>Each bill opens with an <b>AI summary</b> and a comparison to other states' bills, written from the bill text. Always verify against the official page before relying on it.</li><li><b>Model bill</b> lets you paste your model legislation and see what each bill is missing.</li></ul></div></div>`;
    return;
  }
  const ai = ANALYSIS[b.id], mv = movement(b), official = officialUrl(b), tags = issuesOf(b);
  detailPane.innerHTML = `<div class="detail">
    <div class="crumbs"><span class="state-tag">${b.state}</span>${NAMES[b.state]} · ${esc(CHAMBER_LABEL(b.state, b.chamber))} · ${esc(b.session)}</div>
    <h2>${esc(b.number)}</h2><div class="titleline">${esc(b.title)}</div>
    <div class="chips"><span class="badge s${b.status}">${esc(b.status_text)}</span>${mv.label && b.status < 3 ? `<span class="badge mv${mv.level}">${esc(mv.label)}</span>` : ""}${tags.map((t) => `<span class="tag">${ISSUE_LABEL[t]}</span>`).join("")}${ai?.relevance === "incidental" ? `<span class="badge">mentions wagering in passing</span>` : ""}</div>
    <div class="links" style="margin-bottom:16px"><a href="${esc(official)}" target="_blank" rel="noopener">Official bill page ↗</a><a href="${esc(b.legiscan_url)}" target="_blank" rel="noopener">Text &amp; history ↗</a></div>
    ${ai ? `<div class="card ai"><h3>Summary <span class="badge ai">AI, from bill text</span></h3><p>${esc(ai.summary)}</p></div>
      <div class="card ai"><h3>Key provisions</h3><ul>${ai.mechanics.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>
      <div class="card ai"><h3>How it differs from other states</h3><p>${esc(ai.comparison)}</p></div>
      <div class="card watch"><h3>Watch</h3><p>${esc(ai.watch)}</p></div>`
      : `<div class="card"><h3>Summary</h3><p>${esc(b.description || b.title)}</p><p style="color:var(--muted);font-size:12.5px">AI analysis is generated for bills that have moved beyond introduction.</p></div>`}
    <div class="card"><h3>Status</h3><dl class="meta-row"><dt>Last action</dt><dd><b>${fmtDate(b.last_action_date)}</b> — ${esc(b.last_action)}</dd><dt>History</dt><dd><ol class="hist">${(b.history || []).slice().reverse().map((h) => `<li><b>${fmtDate(h.date)}</b> ${esc(h.action)}</li>`).join("")}</ol></dd></dl></div>
    ${sponsorCard(b)}${positionsCard(b)}${modelCard(b)}
    <p class="notice" style="border:0;background:none;padding:8px 0 0">Summaries are generated by Claude from the bill text and can be wrong; the official page is the authority. Statecraft tracks legislation and is not legal advice.</p></div>`;
  detailPane.querySelector("#addpos")?.addEventListener("click", () => { const f = detailPane.querySelector("#posform"); f.hidden = !f.hidden; if (!f.hidden) f.who.focus(); });
  detailPane.querySelector("#posform")?.addEventListener("submit", (e) => { e.preventDefault(); const f = e.target; (positions[b.id] ||= []).push({ who: f.who.value.trim(), stance: f.stance.value, note: f.note.value.trim() }); save("statecraft.positions.v1", positions); render(); });
  detailPane.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => { positions[b.id].splice(Number(btn.dataset.del), 1); if (!positions[b.id].length) delete positions[b.id]; save("statecraft.positions.v1", positions); render(); }));
}
function renderModelEditor() {
  detailPane.innerHTML = `<div class="detail"><h2>Model legislation</h2><p class="titleline">Paste the firm's model bill once. Every bill with text in the snapshot is then scored on how much of the model's language it contains, and each bill's page shows what is missing and what was added.</p>
    <div class="card"><input id="mtitle" placeholder="Name, e.g. Model Sports Wagering Act (2026)" value="${esc(modelBill.title)}" style="width:100%;margin-bottom:8px;font:inherit;padding:7px 9px;border:1px solid var(--line);border-radius:6px">
      <textarea id="mtext" placeholder="Paste model bill text here…">${esc(modelBill.text)}</textarea>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" id="msave">Save model bill</button><button class="btn" id="mclear">Clear</button><span style="color:var(--muted);font-size:12.5px;align-self:center">Stored only in this browser.</span></div></div>
    ${modelBill.text ? `<div class="card"><h3>How matching works</h3><p>The model is split into sentences; each is matched against the bill's sentences by shared legal vocabulary. A sentence counts as covered when at least 60% of its terms appear together in one bill sentence. It finds reused and paraphrased language; it does not judge legal equivalence.</p></div>` : ""}</div>`;
  detailPane.querySelector("#msave").addEventListener("click", () => { modelBill = { title: detailPane.querySelector("#mtitle").value.trim(), text: detailPane.querySelector("#mtext").value }; save("statecraft.modelbill.v1", modelBill); render(); });
  detailPane.querySelector("#mclear").addEventListener("click", () => { modelBill = { title: "", text: "" }; save("statecraft.modelbill.v1", modelBill); render(); });
}
function renderBrief() {
  const moved = movedBills();
  const byIssue = {};
  for (const b of moved) for (const t of issuesOf(b).length ? issuesOf(b) : ["other"]) (byIssue[t] ||= []).push(b);
  const order = [...ISSUES.map((i) => i.key), "other"];
  const tagged = BILLS.filter((b) => posOf(b).length);
  detailPane.innerHTML = `<div class="brief"><h2>Statecraft morning brief</h2><div class="date">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · snapshot ${new Date(DATA.generated).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${moved.length} bills moving in ${new Set(moved.map((b) => b.state)).size} states</div>
    ${tagged.length ? `<h3>Your positions</h3>${tagged.map((b) => `<div class="item"><b>${b.state} ${esc(b.number)}</b> — ${esc(ANALYSIS[b.id]?.summary?.split(". ")[0] || b.title)}. ${posOf(b).map((p) => `<i>${esc(p.who)}: ${esc(p.stance)}</i>`).join("; ")}. Last action ${fmtDate(b.last_action_date)}: ${esc(b.last_action)}</div>`).join("")}` : ""}
    ${order.filter((k) => byIssue[k]).map((k) => `<h3>${ISSUE_LABEL[k] || "Other"} (${byIssue[k].length})</h3>${byIssue[k].slice(0, 12).map((b) => `<div class="item"><b>${b.state} ${esc(b.number)}</b> · ${esc(movement(b).label || b.status_text)} · ${fmtDate(b.last_action_date)}<br>${esc(ANALYSIS[b.id]?.summary || b.title)}</div>`).join("")}`).join("")}
    <p style="color:var(--muted);font-size:12px;margin-top:24px">Generated by Statecraft from state legislative records. AI summaries can be wrong; verify on the official bill page. Not legal advice.</p></div>`;
}

function render() {
  document.getElementById("main").classList.toggle("no-map", view === "model" || view === "brief");
  renderViews(); drawLegend(); drawMap(); renderList(); renderDetail();
}
render();
window.addEventListener("resize", drawMap);
