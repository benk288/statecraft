// Statecraft — sports betting legislative radar.
// Reads the static snapshot in data/bills.js and renders a hoverable US map
// plus a bill panel. No network calls at runtime.

const DATA = window.STATECRAFT_DATA || { bills: [] };
const BILLS = DATA.bills || [];

// FIPS -> postal code, so the map features can be joined to LegiScan's state codes.
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
// Nebraska is unicameral; its "LB" bills belong to the Legislature, not a House.
const CHAMBER_LABEL = (st, ch) => {
  if (st === "NE") return "Legislature";
  if (ch === "H") return ["CA","NY","NJ","NV","WI"].includes(st) ? "Assembly" : "House";
  if (ch === "S") return "Senate";
  return "Other";
};

const isActive = (b) => b.status >= 0 && b.status <= 3;
const today = new Date();
const daysFromNow = (iso) => Math.round((new Date(iso + "T00:00:00") - today) / 86400000);
const fmtDate = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const upcoming = (b) => (b.hearings || []).filter((h) => daysFromNow(h.date) >= -1).sort((a, b) => a.date.localeCompare(b.date));
// Bills whose title is about betting rank above omnibus/budget bills that merely mention it.
const topical = (b) => /sport|wager|bet|gambl|gaming|lottery|casino/i.test(b.title) ? 0 : 1;
const byTopicThenDate = (a, b) => topical(a) - topical(b) || (b.last_action_date || "").localeCompare(a.last_action_date || "");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- aggregate per state ----
const byState = {};
for (const b of BILLS) (byState[b.state] ||= []).push(b);
const activeCount = (st) => (byState[st] || []).filter(isActive).length;

// ---- header meta ----
document.getElementById("meta").innerHTML = DATA.generated
  ? `<b>${BILLS.length}</b> bills · <b>${Object.keys(byState).length}</b> states<br>Snapshot ${new Date(DATA.generated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · ${esc(DATA.source)}`
  : `No bill snapshot loaded yet.<br>Run <code>scripts/fetch_bills.mjs</code> to pull current bills.`;

// ---- map ----
const svg = d3.select("#map");
const wrap = document.getElementById("map-wrap");
const tip = document.getElementById("tip");
const states = topojson.feature(window.US_STATES, window.US_STATES.objects.states).features
  .filter((f) => FIPS[f.id] && FIPS[f.id] !== "PR");
const maxActive = d3.max(states, (f) => activeCount(FIPS[f.id])) || 1;
const color = d3.scaleThreshold()
  .domain([1, 3, 6, 12].filter((d) => d <= Math.max(maxActive, 1)))
  .range(["var(--map-0)", "var(--map-1)", "var(--map-2)", "var(--map-3)", "var(--map-4)"]);

let selected = null;
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
  const bills = byState[st] || [];
  const active = bills.filter(isActive);
  const h = active.filter((b) => b.chamber === "H").length;
  const s = active.filter((b) => b.chamber === "S").length;
  const hearings = active.filter((b) => upcoming(b).length).length;
  const r = wrap.getBoundingClientRect();
  tip.style.display = "block";
  tip.innerHTML = `<div class="name">${NAMES[st]}</div>
    <div>${active.length} active bill${active.length === 1 ? "" : "s"} <span class="sub">(${bills.length} tracked)</span></div>
    <div class="sub">${st === "NE" ? `${active.length} Legislature` : `${h} ${CHAMBER_LABEL(st, "H")} · ${s} Senate`}${hearings ? ` · ${hearings} with hearings scheduled` : ""}</div>
    <div class="hint">Click to open ${st} docket →</div>`;
  const x = Math.min(ev.clientX - r.left + 14, r.width - tip.offsetWidth - 10);
  const y = Math.min(ev.clientY - r.top + 14, r.height - tip.offsetHeight - 10);
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
function drawLegend() {
  const d = color.domain();
  const rows = [[`No active bills`, color(0)]];
  for (let i = 0; i < d.length; i++) {
    const lo = d[i], hi = d[i + 1];
    rows.push([hi ? `${lo}–${hi - 1} active` : `${lo}+ active`, color(lo)]);
  }
  document.getElementById("legend").innerHTML = `<div><b>Active sports-betting bills</b></div>` +
    rows.map(([l, c]) => `<div class="row"><span class="sw" style="background:${c}"></span>${l}</div>`).join("") +
    `<div class="row"><span class="sw" style="background:var(--hover)"></span>Hover to inspect</div>`;
}

// ---- panel ----
const panel = document.getElementById("panel");
let filter = { chamber: "ALL", activeOnly: true, q: "" };

function selectState(st) {
  selected = st === selected ? null : st;
  drawMap();
  renderPanel();
}

// Some state feeds publish an API/FTP address rather than a bill page. Rebuild
// a human-readable official URL where the pattern is known; otherwise fall back
// to the aggregator's bill page, which itself links to the official source.
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
  const built = builders[b.state]?.();
  return built || b.legiscan_url || b.url;
}

function billCard(b, showState = false) {
  const next = upcoming(b)[0];
  const official = officialUrl(b);
  return `<div class="bill">
    <div class="top">
      ${showState ? `<span class="state-tag">${b.state}</span>` : ""}
      <span class="num"><a href="${esc(official)}" target="_blank" rel="noopener" title="Open on the official ${NAMES[b.state]} legislature site">${esc(b.number)}</a></span>
      <span class="badge s${b.status}">${esc(b.status_text)}</span>
      ${next ? `<span class="badge hearing">Hearing ${fmtDate(next.date)}${next.time ? " · " + esc(next.time) : ""}</span>` : ""}
      <span class="st">${esc(CHAMBER_LABEL(b.state, b.chamber))}</span>
    </div>
    <div class="title">${esc(b.title)}</div>
    <div class="action">Last action <b>${fmtDate(b.last_action_date)}</b>: ${esc(b.last_action)}</div>
    ${next && next.description ? `<div class="action">Scheduled: ${esc(next.description)}${next.location ? " — " + esc(next.location) : ""}</div>` : ""}
    <div class="links">
      <a href="${esc(official)}" target="_blank" rel="noopener">Official bill page ↗</a>
      <a href="${esc(b.legiscan_url || "#")}" target="_blank" rel="noopener">Text &amp; history ↗</a>
    </div>
  </div>`;
}

function applyFilter(list) {
  return list.filter((b) =>
    (filter.chamber === "ALL" || b.chamber === filter.chamber) &&
    (!filter.activeOnly || isActive(b)) &&
    (!filter.q || `${b.number} ${b.title} ${b.description} ${b.last_action} ${(b.sponsors || []).join(" ")}`.toLowerCase().includes(filter.q))
  );
}

function controlsHTML(showChamber) {
  return `<div class="controls">
    ${showChamber ? `<div class="tabs" id="chamber">
      <button data-c="ALL" class="${filter.chamber === "ALL" ? "on" : ""}">All</button>
      <button data-c="H" class="${filter.chamber === "H" ? "on" : ""}">${selected ? esc(CHAMBER_LABEL(selected, "H")) : "House"}</button>
      <button data-c="S" class="${filter.chamber === "S" ? "on" : ""}">Senate</button>
    </div>` : ""}
    <input type="search" id="q" placeholder="Search bills, sponsors, actions…" value="${esc(filter.q)}">
    <label><input type="checkbox" id="active" ${filter.activeOnly ? "checked" : ""}> Active only</label>
  </div>`;
}

function renderPanel() {
  if (!BILLS.length) {
    panel.innerHTML = `<div class="panel-head"><h2>Nationwide</h2><div class="sub">Sports betting legislation, all 50 states</div></div>
      <div class="empty">No bill snapshot is loaded. Run <code>LEGISCAN_KEY=… node scripts/fetch_bills.mjs</code> to pull current bills from the state legislatures, then reload.</div>`;
    return;
  }
  if (selected) renderState(selected);
  else renderNational();
  wireControls();
}

function renderNational() {
  const active = BILLS.filter(isActive);
  const withHearings = active.filter((b) => upcoming(b).length).sort((a, b) => upcoming(a)[0].date.localeCompare(upcoming(b)[0].date));
  const recent = BILLS.filter((b) => daysFromNow(b.last_action_date) >= -14).sort((a, b) => b.last_action_date.localeCompare(a.last_action_date));
  const enacted = BILLS.filter((b) => b.status === 4).sort(byTopicThenDate);
  const visible = applyFilter(filter.q ? BILLS : []);
  // Open States snapshots carry no hearing calendar; fall back to bills in motion between chambers.
  const inMotion = active.filter((b) => b.status === 2 || b.status === 3).sort(byTopicThenDate);
  const hasHearings = withHearings.length > 0;
  panel.innerHTML = `<div class="panel-head">
      <h2>Nationwide docket</h2>
      <div class="sub">Hover a state for its counts; click to open its bills.</div>
      <div class="stats">
        <div class="stat"><div class="n">${active.length}</div><div class="l">Active bills</div></div>
        <div class="stat"><div class="n">${new Set(active.map((b) => b.state)).size}</div><div class="l">States in play</div></div>
        <div class="stat"><div class="n">${hasHearings ? withHearings.length : inMotion.length}</div><div class="l">${hasHearings ? "Hearings ahead" : "Passed a chamber"}</div></div>
      </div>
    </div>
    ${controlsHTML(false)}
    <div class="list">
      ${filter.q ? `<div class="section-title">Search results (${visible.length})</div>${visible.slice(0, 80).map((b) => billCard(b, true)).join("") || `<div class="empty">No bills match.</div>`}` : `
      ${hasHearings
        ? `<div class="section-title">Upcoming hearings &amp; floor calendar</div>${withHearings.slice(0, 25).map((b) => billCard(b, true)).join("")}`
        : `<div class="section-title">Passed a chamber, awaiting the other (${inMotion.length})</div>${inMotion.slice(0, 25).map((b) => billCard(b, true)).join("") || `<div class="empty">None in the snapshot.</div>`}`}
      <div class="section-title">Moved in the last 14 days</div>
      ${recent.slice(0, 40).map((b) => billCard(b, true)).join("") || `<div class="empty">No actions in the last 14 days.</div>`}
      <div class="section-title">Signed into law this session</div>
      ${enacted.slice(0, 30).map((b) => billCard(b, true)).join("") || `<div class="empty">None yet.</div>`}`}
    </div>
    <div class="notice">Bill data is pulled from each state legislature's official feed and stored as a snapshot; every bill links to its official state page. Statecraft tracks legislation — it is not legal advice. Verify status on the official site before relying on it.<br>Legislative data: ${esc(DATA.source)}${/LegiScan/.test(DATA.source || "") ? ' (<a href="https://legiscan.com/" target="_blank" rel="noopener">LegiScan</a>, CC BY 4.0)' : ""}.</div>`;
}

function renderState(st) {
  const bills = byState[st] || [];
  const active = bills.filter(isActive);
  const list = applyFilter(bills).sort((a, b) => {
    const ha = upcoming(a).length ? 0 : 1, hb = upcoming(b).length ? 0 : 1;
    return ha - hb || byTopicThenDate(a, b);
  });
  const h = active.filter((b) => b.chamber === "H").length, s = active.filter((b) => b.chamber === "S").length;
  panel.innerHTML = `<div class="panel-head">
      <button class="back" id="back">← All states</button>
      <h2>${NAMES[st]}</h2>
      <div class="sub">${bills.length} sports-betting bill${bills.length === 1 ? "" : "s"} tracked this session${bills[0]?.session ? ` · ${esc(bills[0].session)}` : ""}</div>
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

function wireControls() {
  panel.querySelector("#back")?.addEventListener("click", () => selectState(selected));
  panel.querySelectorAll("#chamber button").forEach((btn) => btn.addEventListener("click", () => { filter.chamber = btn.dataset.c; renderPanel(); }));
  panel.querySelector("#active")?.addEventListener("change", (e) => { filter.activeOnly = e.target.checked; renderPanel(); });
  const q = panel.querySelector("#q");
  q?.addEventListener("input", (e) => {
    filter.q = e.target.value.trim().toLowerCase();
    const pos = e.target.selectionStart;
    renderPanel();
    const nq = panel.querySelector("#q"); nq.focus(); nq.setSelectionRange(pos, pos);
  });
}

drawLegend();
drawMap();
renderPanel();
window.addEventListener("resize", drawMap);
