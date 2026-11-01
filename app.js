// Statecraft v2 — sports betting legislative radar for a regulatory practice.
// Reads the static snapshot in data/bills.js and renders a hoverable US map
// plus a bill panel. No network calls at runtime. Stakeholder positions are
// saved in the browser (localStorage) only.

const DATA = window.STATECRAFT_DATA || { bills: [] };
const BILLS = DATA.bills || [];

const FIPS = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA",
  "15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA",
  "26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY",
  "37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX",
  "49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY","72":"PR"
};
const NAMES = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",
  DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",
  KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",
  NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",
  PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",
  VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",PR:"Puerto Rico"
};
const CHAMBER_LABEL = (st, ch) => {
  if (st === "NE") return "Legislature";
  if (ch === "H") return ["CA","NY","NJ","NV","WI"].includes(st) ? "Assembly" : "House";
  if (ch === "S") return "Senate";
  return "Other";
};

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
const issueText = (b) => `${b.title} ${b.description || ""}`;
const issuesOf = (b) => ISSUES.filter((i) => i.re.test(issueText(b))).map((i) => i.key);
const ISSUE_LABEL = Object.fromEntries(ISSUES.map((i) => [i.key, i.label]));

// ---- movement: a bill introduction is not news; leaving committee or reaching the floor is ----
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
const today = new Date();
const daysFromNow = (iso) => Math.round((new Date(iso + "T00:00:00") - today) / 86400000);
const fmtDate = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const topical = (b) => /sport|wager|bet|gambl|gaming|lottery|casino|prediction/i.test(b.title) ? 0 : 1;
const byDateDesc = (a, b) => (b.last_action_date || "").localeCompare(a.last_action_date || "");
const byMovement = (a, b) => movement(b).level - movement(a).level || topical(a) - topical(b) || byDateDesc(a, b);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- stakeholder positions (browser-local) ----
const STORE_KEY = "statecraft.positions.v1";
let positions = {};
try { positions = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { positions = {}; }
function savePositions() { try { localStorage.setItem(STORE_KEY, JSON.stringify(positions)); } catch {} }
const posOf = (b) => positions[b.id] || [];
const STANCES = ["Oppose", "Support", "Monitor", "Amend"];

// ---- official links ----
const BAD_URL = /^ftp:|wsdl|bill-search$|billsearch|prefiledBills|loadBillsIntroduced|search_by_date|status\.rilegislature\.gov\/?$|FTPDocument|legislation\.nysenate\.gov\/api/;
function officialUrl(b) {
  const num = b.number.replace(/\s+/g, "");
  const year = (b.session.match(/\d{4}/) || [""])[0];
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

// ---- state ----
const byState = {};
for (const b of BILLS) (byState[b.state] ||= []).push(b);
let selected = null;
let view = "docket"; // docket | positions
let filter = { chamber: "ALL", activeOnly: true, q: "", issue: "ALL" };
const expanded = new Set();

const matchesIssue = (b) => filter.issue === "ALL" || issuesOf(b).includes(filter.issue);
const stateBills = (st) => (byState[st] || []).filter(matchesIssue);
const activeCount = (st) => stateBills(st).filter(isActive).length;

// ---- header ----
document.getElementById("meta").innerHTML = DATA.generated
  ? `<b>${BILLS.length}</b> bills · <b>${Object.keys(byState).length}</b> states<br>Snapshot ${new Date(DATA.generated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · ${esc(DATA.source)}`
  : `No bill snapshot loaded yet.`;

// ---- map ----
const svg = d3.select("#map");
const wrap = document.getElementById("map-wrap");
const tip = document.getElementById("tip");
const states = topojson.feature(window.US_STATES, window.US_STATES.objects.states).features
  .filter((f) => FIPS[f.id] && FIPS[f.id] !== "PR");
const color = d3.scaleThreshold().domain([1, 3, 6, 12]).range(["var(--map-0)", "var(--map-1)", "var(--map-2)", "var(--map-3)", "var(--map-4)"]);

function drawMap() {
  const { width, height } = wrap.getBoundingClientRect();
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  const projection = d3.geoAlbersUsa().fitExtent([[16, 16], [width - 16, height - 16]], { type: "FeatureCollection", features: states });
  const path = d3.geoPath(projection);
  svg.selectAll("path.state")
    .data(states, (f) => f.id)
    .join("path")
    .attr("class", (f) => "state" + (FIPS[f.id] === selected ? " selected" : ""))
    .attr("d", path)
    .attr("fill", (f) => color(activeCount(FIPS[f.id])))
    .on("mousemove", (ev, f) => showTip(ev, FIPS[f.id]))
    .on("mouseleave", () => (tip.style.display = "none"))
    .on("click", (ev, f) => selectState(FIPS[f.id]));
  svg.selectAll("path.state").filter((f) => FIPS[f.id] === selected).raise();
}
function showTip(ev, st) {
  const bills = stateBills(st);
  const active = bills.filter(isActive);
  const h = active.filter((b) => b.chamber === "H").length;
  const s = active.filter((b) => b.chamber === "S").length;
  const moved = active.filter((b) => movement(b).level >= 2).length;
  const tagged = bills.filter((b) => posOf(b).length).length;
  const r = wrap.getBoundingClientRect();
  tip.style.display = "block";
  tip.innerHTML = `<div class="name">${NAMES[st]}</div>
    <div>${active.length} active bill${active.length === 1 ? "" : "s"}${filter.issue !== "ALL" ? ` on ${ISSUE_LABEL[filter.issue].toLowerCase()}` : ""} <span class="sub">(${bills.length} tracked)</span></div>
    <div class="sub">${st === "NE" ? `${active.length} Legislature` : `${h} ${CHAMBER_LABEL(st, "H")} · ${s} Senate`}</div>
    ${moved ? `<div class="sub">${moved} out of committee or on the floor</div>` : ""}
    ${tagged ? `<div class="sub">${tagged} with client positions</div>` : ""}
    <div class="hint">Click to open ${st} docket →</div>`;
  tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - tip.offsetWidth - 10) + "px";
  tip.style.top = Math.min(ev.clientY - r.top + 14, r.height - tip.offsetHeight - 10) + "px";
}
function drawLegend() {
  const d = color.domain();
  const rows = [[`No active bills`, color(0)]];
  for (let i = 0; i < d.length; i++) rows.push([d[i + 1] ? `${d[i]}–${d[i + 1] - 1} active` : `${d[i]}+ active`, color(d[i])]);
  document.getElementById("legend").innerHTML = `<div><b>Active bills${filter.issue !== "ALL" ? ": " + ISSUE_LABEL[filter.issue] : ""}</b></div>` +
    rows.map(([l, c]) => `<div class="row"><span class="sw" style="background:${c}"></span>${l}</div>`).join("") +
    `<div class="row"><span class="sw" style="background:var(--hover)"></span>Hover to inspect</div>`;
}

// ---- issue lens control (lives in the map corner) ----
const lens = document.getElementById("lens");
lens.innerHTML = `<label for="issue">Issue lens</label><select id="issue"><option value="ALL">All sports-betting bills</option>${ISSUES.map((i) => `<option value="${i.key}">${i.label}</option>`).join("")}</select>`;
lens.querySelector("#issue").addEventListener("change", (e) => { filter.issue = e.target.value; drawLegend(); drawMap(); renderPanel(); });

// ---- panel ----
const panel = document.getElementById("panel");
function selectState(st) { selected = st === selected ? null : st; view = "docket"; drawMap(); renderPanel(); }

function positionsHTML(b) {
  const list = posOf(b);
  return `<div class="positions">
    ${list.map((p, i) => `<span class="pos ${p.stance.toLowerCase()}" title="${esc(p.note)}">${esc(p.who)}: ${esc(p.stance)}${p.note ? ` — ${esc(p.note)}` : ""}<button class="x" data-del="${b.id}|${i}" title="Remove">×</button></span>`).join("")}
    <button class="addpos" data-add="${b.id}">+ Position</button>
  </div>
  <form class="posform" data-form="${b.id}" hidden>
    <input name="who" placeholder="Client / stakeholder" required>
    <select name="stance">${STANCES.map((s) => `<option>${s}</option>`).join("")}</select>
    <input name="note" placeholder="Note (optional)">
    <button type="submit">Save</button>
  </form>`;
}

function billCard(b, showState = false) {
  const official = officialUrl(b);
  const mv = movement(b);
  const tags = issuesOf(b);
  const open = expanded.has(b.id);
  return `<div class="bill${mv.level >= 2 ? " moved" : ""}">
    <div class="top">
      ${showState ? `<span class="state-tag">${b.state}</span>` : ""}
      <span class="num"><a href="${esc(official)}" target="_blank" rel="noopener">${esc(b.number)}</a></span>
      <span class="badge s${b.status}">${esc(b.status_text)}</span>
      ${mv.label && b.status < 3 ? `<span class="badge mv${mv.level}">${esc(mv.label)}</span>` : ""}
      <span class="st">${esc(CHAMBER_LABEL(b.state, b.chamber))}</span>
    </div>
    <div class="title">${esc(b.title)}</div>
    ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${ISSUE_LABEL[t]}</span>`).join("")}</div>` : ""}
    <div class="action">Last action <b>${fmtDate(b.last_action_date)}</b>: ${esc(b.last_action)}</div>
    ${positionsHTML(b)}
    <div class="links">
      <a href="${esc(official)}" target="_blank" rel="noopener">Official bill page ↗</a>
      <a href="${esc(b.legiscan_url || "#")}" target="_blank" rel="noopener">Text &amp; history ↗</a>
      <button class="linkbtn" data-hist="${b.id}">${open ? "Hide history" : "History"}</button>
    </div>
    ${open ? `<ol class="hist">${(b.history || []).slice().reverse().map((h) => `<li><b>${fmtDate(h.date)}</b> ${esc(h.action)}</li>`).join("") || "<li>No history in snapshot.</li>"}</ol>` : ""}
  </div>`;
}

function applyFilter(list) {
  return list.filter((b) =>
    matchesIssue(b) &&
    (filter.chamber === "ALL" || b.chamber === filter.chamber) &&
    (!filter.activeOnly || isActive(b)) &&
    (!filter.q || `${b.number} ${b.title} ${b.description} ${b.last_action} ${(b.sponsors || []).join(" ")} ${posOf(b).map((p) => p.who + " " + p.stance).join(" ")}`.toLowerCase().includes(filter.q))
  );
}

function controlsHTML(showChamber) {
  return `<div class="controls">
    ${showChamber ? `<div class="tabs" id="chamber">
      <button data-c="ALL" class="${filter.chamber === "ALL" ? "on" : ""}">All</button>
      <button data-c="H" class="${filter.chamber === "H" ? "on" : ""}">${selected ? esc(CHAMBER_LABEL(selected, "H")) : "House"}</button>
      <button data-c="S" class="${filter.chamber === "S" ? "on" : ""}">Senate</button>
    </div>` : ""}
    <input type="search" id="q" placeholder="Search bills, sponsors, clients…" value="${esc(filter.q)}">
    <label><input type="checkbox" id="active" ${filter.activeOnly ? "checked" : ""}> Active only</label>
  </div>`;
}

function renderPanel() {
  if (!BILLS.length) { panel.innerHTML = `<div class="empty">No bill snapshot is loaded.</div>`; return; }
  if (view === "positions") renderPositions();
  else if (selected) renderState(selected);
  else renderNational();
  wireControls();
}

function renderNational() {
  const pool = BILLS.filter(matchesIssue);
  const active = pool.filter(isActive);
  const moved = active.filter((b) => movement(b).level >= 2).sort(byMovement);
  const enacted = pool.filter((b) => b.status === 4).sort((a, b) => topical(a) - topical(b) || byDateDesc(a, b));
  const visible = applyFilter(filter.q ? BILLS : []);
  const taggedCount = Object.keys(positions).filter((id) => positions[id].length).length;
  panel.innerHTML = `<div class="panel-head">
      <div class="headrow"><h2>What moved</h2><button class="back" id="gopos">Client positions (${taggedCount}) →</button></div>
      <div class="sub">Bills out of committee, on a calendar, or past a floor vote${filter.issue !== "ALL" ? ` · ${ISSUE_LABEL[filter.issue]}` : ""}. Hover a state for counts; click to open its docket.</div>
      <div class="stats">
        <div class="stat"><div class="n">${moved.length}</div><div class="l">Moved</div></div>
        <div class="stat"><div class="n">${active.length}</div><div class="l">Active bills</div></div>
        <div class="stat"><div class="n">${new Set(active.map((b) => b.state)).size}</div><div class="l">States in play</div></div>
      </div>
    </div>
    ${controlsHTML(false)}
    <div class="list">
      ${filter.q ? `<div class="section-title">Search results (${visible.length})</div>${visible.sort(byMovement).slice(0, 80).map((b) => billCard(b, true)).join("") || `<div class="empty">No bills match.</div>`}` : `
      <div class="section-title">Moving now (${moved.length})</div>
      ${moved.slice(0, 40).map((b) => billCard(b, true)).join("") || `<div class="empty">Nothing beyond introduction in this lens.</div>`}
      <div class="section-title">Signed into law this session (${enacted.length})</div>
      ${enacted.slice(0, 30).map((b) => billCard(b, true)).join("") || `<div class="empty">None yet.</div>`}`}
    </div>
    <div class="notice">Bill data is pulled from each state legislature's official feed and stored as a snapshot; every bill links to its official state page. Positions and notes stay in this browser. Statecraft tracks legislation — it is not legal advice.<br>Legislative data: ${esc(DATA.source)}.</div>`;
}

function renderState(st) {
  const bills = byState[st] || [];
  const active = bills.filter(matchesIssue).filter(isActive);
  const list = applyFilter(bills).sort(byMovement);
  const h = active.filter((b) => b.chamber === "H").length, s = active.filter((b) => b.chamber === "S").length;
  panel.innerHTML = `<div class="panel-head">
      <button class="back" id="back">← All states</button>
      <h2>${NAMES[st]}</h2>
      <div class="sub">${bills.length} sports-betting bill${bills.length === 1 ? "" : "s"} tracked${bills[0]?.session ? ` · ${esc(bills[0].session)}` : ""} · sorted by movement</div>
      <div class="stats">
        <div class="stat"><div class="n">${active.length}</div><div class="l">Active</div></div>
        <div class="stat"><div class="n">${st === "NE" ? active.length : h}</div><div class="l">${esc(CHAMBER_LABEL(st, "H"))}</div></div>
        <div class="stat"><div class="n">${st === "NE" ? "—" : s}</div><div class="l">Senate</div></div>
      </div>
    </div>
    ${controlsHTML(st !== "NE")}
    <div class="list">
      ${list.map((b) => billCard(b)).join("") || `<div class="empty">${bills.length ? "No bills match the current filters." : `No sports-betting bills found in ${NAMES[st]} this session.`}</div>`}
    </div>
    <div class="notice">Links open the bill on the official ${NAMES[st]} legislature website. Verify status there before relying on it.</div>`;
}

function renderPositions() {
  const tagged = BILLS.filter((b) => posOf(b).length).sort(byMovement);
  const who = new Set(tagged.flatMap((b) => posOf(b).map((p) => p.who)));
  panel.innerHTML = `<div class="panel-head">
      <button class="back" id="back">← What moved</button>
      <h2>Client positions</h2>
      <div class="sub">${tagged.length} bill${tagged.length === 1 ? "" : "s"} with a recorded position · ${who.size} stakeholder${who.size === 1 ? "" : "s"}</div>
      <div class="stats">
        ${STANCES.slice(0, 3).map((s) => `<div class="stat"><div class="n">${tagged.filter((b) => posOf(b).some((p) => p.stance === s)).length}</div><div class="l">${s}</div></div>`).join("")}
      </div>
    </div>
    <div class="list">
      ${tagged.map((b) => billCard(b, true)).join("") || `<div class="empty">No positions yet. Open any bill and click “+ Position” to record where a client or stakeholder stands.</div>`}
    </div>
    <div class="notice">Positions are stored only in this browser. Use fictional client names for demos.</div>`;
}

function wireControls() {
  panel.querySelector("#back")?.addEventListener("click", () => { if (view === "positions") { view = "docket"; renderPanel(); } else selectState(selected); });
  panel.querySelector("#gopos")?.addEventListener("click", () => { view = "positions"; renderPanel(); });
  panel.querySelectorAll("#chamber button").forEach((btn) => btn.addEventListener("click", () => { filter.chamber = btn.dataset.c; renderPanel(); }));
  panel.querySelector("#active")?.addEventListener("change", (e) => { filter.activeOnly = e.target.checked; renderPanel(); });
  const q = panel.querySelector("#q");
  q?.addEventListener("input", (e) => {
    filter.q = e.target.value.trim().toLowerCase();
    const pos = e.target.selectionStart;
    renderPanel();
    const nq = panel.querySelector("#q"); nq.focus(); nq.setSelectionRange(pos, pos);
  });
  panel.querySelectorAll("[data-hist]").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.dataset.hist; expanded.has(id) ? expanded.delete(id) : expanded.add(id); rerenderKeepScroll();
  }));
  panel.querySelectorAll("[data-add]").forEach((btn) => btn.addEventListener("click", () => {
    const f = panel.querySelector(`[data-form="${btn.dataset.add}"]`); f.hidden = !f.hidden; if (!f.hidden) f.querySelector("input").focus();
  }));
  panel.querySelectorAll("[data-form]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = f.dataset.form;
    (positions[id] ||= []).push({ who: f.who.value.trim(), stance: f.stance.value, note: f.note.value.trim() });
    savePositions(); drawMap(); rerenderKeepScroll();
  }));
  panel.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => {
    const [id, i] = btn.dataset.del.split("|");
    positions[id].splice(Number(i), 1); if (!positions[id].length) delete positions[id];
    savePositions(); drawMap(); rerenderKeepScroll();
  }));
}
function rerenderKeepScroll() {
  const top = panel.querySelector(".list")?.scrollTop || 0;
  renderPanel();
  const l = panel.querySelector(".list"); if (l) l.scrollTop = top;
}

drawLegend();
drawMap();
renderPanel();
window.addEventListener("resize", drawMap);
