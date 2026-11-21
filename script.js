/* ===== API ===== */
const API_URL = "PASTE_URL_HERE";   // ← paste your HTTP API invoke URL here
const apiOk = () => API_URL && API_URL !== "PASTE_URL_HERE";

/* ===== EDIT ME ===== */
const GAME_SEC = 240, START_CASH = 10000, SPEED = 140;
const CATS = {
  land: { c: "#8b8fa3", b: 40, pk: [9, 16], n: "Landmark", t: "Everyone passes through. Steady and never wild." },
  acad: { c: "#3a56e8", b: 90, pk: [10.5, 15], n: "Academics", t: "Busy during lectures, quiet after 5 PM." },
  lib: { c: "#1f2a6b", b: 110, pk: [19, 22.5], n: "Library", t: "Fills up in the evening, brutal before exams." },
  ess: { c: "#f5c518", b: 55, pk: [18, 23.5], n: "Essentials", t: "Evening rush, and midnight Maggi runs." },
  food: { c: "#ff9f1c", b: 35, pk: [13.5, 17, 21], n: "Food", t: "Queue length is the demand signal." },
  dine: { c: "#ff6b3d", b: 45, pk: [8.5, 13.5, 20], n: "Dining hall", t: "Meal times only. Buy before the rush, sell in it." },
  host: { c: "#ff5fb8", b: 70, pk: [23], n: "Hostel", t: "Calm in the day, wild at night." },
  health: { c: "#e5484d", b: 60, pk: [12, 17], n: "Healthcare", t: "Spikes in exam and fest weeks." },
  sport: { c: "#19b36a", b: 65, pk: [17.5, 19], n: "Sports", t: "Evening is game time." },
  green: { c: "#2f8f5b", b: 50, pk: [17.5], n: "Green place", t: "Peaceful. Sunset is the peak." },
};
const PLACES = [
  ["gate", "Gate 1", "land", 500, 585], ["vista", "Central Vista", "land", 500, 495], ["uac", "UAC", "land", 640, 470],
  ["a", "A Block", "acad", 390, 400], ["b", "B Block", "acad", 460, 380], ["c", "C Block", "acad", 540, 380], ["d", "D Block", "acad", 610, 400],
  ["lib", "Central Library", "lib", 500, 310],
  ["arc", "Shopping Arcade", "ess", 320, 480], ["mini", "24/7 Minimart", "ess", 235, 525],
  ["cnd", "CnD", "food", 370, 555], ["anb", "AnB", "food", 285, 430], ["grub", "Grub Square", "food", 190, 455], ["nes", "Nescafe", "food", 420, 305],
  ["dh1", "DH 1", "dine", 150, 240], ["dh2", "DH 2", "dine", 290, 240], ["dh3", "DH 3", "dine", 430, 230],
  ["h1", "Sunderbans 1A", "host", 110, 80], ["h2", "Kaziranga 2B", "host", 220, 80], ["h3", "Gir 3A", "host", 330, 80], ["h4", "Manas 4A", "host", 440, 80],
  ["h5", "Betla 5A", "host", 110, 150], ["h6", "Satpura 6B", "host", 220, 150], ["h7", "Eagle Nest", "host", 330, 150], ["h8", "Tower 9", "host", 440, 150],
  ["hwc", "Health and Wellness", "health", 780, 230], ["pharm", "Pharmacy", "health", 870, 300],
  ["amph", "Amphitheatre", "sport", 690, 240], ["golf", "Golf Course", "sport", 900, 160], ["bask", "Basketball Court", "sport", 760, 400],
  ["foot", "Football Ground", "sport", 850, 450], ["crick", "Cricket Ground", "sport", 880, 545], ["isc", "ISC", "sport", 750, 525], ["gym", "Gym", "sport", 650, 555],
  ["lake", "Lake SNU", "green", 610, 150], ["bio", "SNU Biodiversity Park", "green", 790, 95],
];
const EVENTS = [
  ["Surprise quiz tomorrow. Everyone is heading to the library", { lib: .22, "@acad": .08, nes: .12 }],
  ["Fest night at the Amphitheatre", { amph: .30, "@food": .10, "@host": -.05 }],
  ["Football match tonight", { foot: .25, crick: .08, bask: .10 }],
  ["DH 2 is serving paneer today", { dh2: .28, dh1: -.08, dh3: -.08 }],
  ["Maggi shortage at the Minimart", { mini: .25, arc: .10 }],
  ["Power cut in the hostel blocks", { "@host": -.15, lib: .12 }],
  ["Placement talk at the UAC", { uac: .25, "@acad": .06 }],
  ["Mid-sem datesheet released", { lib: .20, "@acad": .10, gym: -.10 }],
  ["Free sunset yoga by the lake", { lake: .25, bio: .12 }],
  ["Health camp at the wellness centre", { hwc: .25, pharm: .15 }],
  ["Rain starts, everyone runs indoors", { "@sport": -.15, "@green": -.15, "@food": .08, arc: .08 }],
  ["Cold coffee offer at Nescafe", { nes: .25, cnd: -.08 }],
];

/* =================== */
const $ = id => document.getElementById(id), NS = "http://www.w3.org/2000/svg";
const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");
const randn = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
const P = Object.fromEntries(PLACES.map(([id, name, cat, x, y], i) => [id, { id, name, cat, x, y, base: CATS[cat].b * (0.85 + ((i * 37) % 30) / 100), pr: 0, pend: 0 }]));
const SIZE = { host: [46, 30], acad: [54, 34], lib: [60, 36] };
let S, loop, acc, toastT;

/* ===== Crowd data from API ===== */
let CROWD_DATA = {};
let crowdTimer = null;

const hour = () => 8 + S.t * 16 / GAME_SEC;
const fmtH = h => String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.floor((h % 1) * 60)).padStart(2, "0");
const demand = (cat, h) => Math.min(1.2, CATS[cat].pk.reduce((a, p) => a + Math.exp(-((h - p) ** 2) / (2 * 1.4 * 1.4)), 0));
const target = p => p.base * (0.6 + demand(p.cat, hour())) * (1 + .45 * Math.tanh(p.pr / 12)) * (1 + 0.05 * (CROWD_DATA[p.id] || 0));
const worth = () => S.cash + Object.keys(S.hold).reduce((a, k) => a + S.hold[k].q * P[k].p, 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const SKY = [[8, "#ffd29a", .22], [11, "#ffffff", 0], [15, "#ffffff", 0], [17.5, "#ff9a4d", .24], [20, "#4b4aa0", .26], [24, "#2a2f6e", .34]];
function tint(h) {
  let i = 0; while (i < SKY.length - 2 && h > SKY[i + 1][0]) i++;
  const a = SKY[i], b = SKY[i + 1], k = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0])));
  $("tint").setAttribute("fill", k < .5 ? a[1] : b[1]); $("tint").setAttribute("opacity", a[2] + (b[2] - a[2]) * k);
}

/* ===== AUTH STATE ===== */
let AUTH_TOKEN = localStorage.getItem("snu_token");
let AUTH_USER = JSON.parse(localStorage.getItem("snu_user") || "null"); // {email, name}
const currentEmail = () => AUTH_USER ? AUTH_USER.email : "";
const currentName = () => AUTH_USER ? AUTH_USER.name : "";

/* ===== API helpers ===== */
async function apiGet(path) {
  const headers = {};
  if (AUTH_TOKEN) headers["Authorization"] = "Bearer " + AUTH_TOKEN;
  const r = await fetch(API_URL + path, { headers });
  if (r.status === 401) { logout(); throw new Error("Session expired"); }
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
async function apiPost(path, body) {
  const headers = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) headers["Authorization"] = "Bearer " + AUTH_TOKEN;
  const r = await fetch(API_URL + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (r.status === 401) { logout(); throw new Error("Session expired"); }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const e = new Error(err.error || r.status);
    e.status = r.status;
    e.body = err;
    throw e;
  }
  return r.json();
}

/* ===== TAB SWITCHING ===== */
function switchTab(tab) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-tab, .bottom-tab").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
  const target = document.getElementById("tab" + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (target) target.classList.add("active");
  if (tab === "connect") loadConnect();
  if (tab === "lostfound") loadLostFound();
}
document.querySelectorAll(".nav-tab, .bottom-tab").forEach(el => {
  el.addEventListener("click", e => { e.preventDefault(); switchTab(el.dataset.tab); });
});

/* ===== TICKER ===== */
function buildTicker() {
  if (!S) return;
  let items = PLACES.map(([id, name]) => {
    const p = P[id], c = ((p.p / p.open - 1) * 100);
    const arrow = c >= 0 ? "▲" : "▼";
    const cls = c >= 0 ? "up" : "down";
    let extra = "";
    const crowd = CROWD_DATA[id] || 0;
    if (crowd >= 5) extra = ` <span class="packed">PACKED</span>`;
    else if (crowd >= 2) extra = ` <span class="packed">BUSY</span>`;
    return `${name} <span class="${cls}">${arrow} ${c >= 0 ? "+" : ""}${c.toFixed(0)}%</span>${extra}`;
  });
  const el = $("ticker");
  el.innerHTML = items.join(" · ") + " · " + items.join(" · ");
  // Scale duration to ~40px/s so speed stays consistent regardless of content length
  requestAnimationFrame(() => {
    const w = el.scrollWidth / 2; // half because content is duplicated
    el.style.animationDuration = Math.max(20, w / 40) + "s";
  });
}

/* ===== HOW IT WORKS ===== */
function initHow() {
  if (localStorage.getItem("snu_how_dismissed")) return;
  $("howCard").style.display = "block";
  $("howDismiss").onclick = () => { $("howCard").style.display = "none"; localStorage.setItem("snu_how_dismissed", "1"); };
}
if ($("howBtn")) $("howBtn").onclick = () => {
  $("howCard").style.display = $("howCard").style.display === "none" ? "block" : "none";
};

/* ===== Crowd polling (every 20s) ===== */
async function fetchCrowd() {
  try {
    CROWD_DATA = await apiGet("/crowd");
    renderCrowdPanel();
    updateBusyRings();
    buildTicker();
  } catch (e) {
    renderCrowdPanel();
    buildTicker();
  }
}

function renderCrowdPanel() {
  const panel = $("crowdPanel");
  if (!panel) return;
  const entries = PLACES.map(([id, name]) => ({ id, name, count: CROWD_DATA[id] || 0 }))
    .sort((a, b) => b.count - a.count)
    .filter(e => e.count > 0);

  if (entries.length === 0) {
    panel.innerHTML = `<div class="empty-sticker">🏕️ Campus is quiet. Be the first to check in!</div>`;
    return;
  }

  const max = Math.max(1, entries[0].count);
  panel.innerHTML = entries.map(e => {
    const pct = Math.round((e.count / max) * 100);
    const level = e.count >= 5 ? "packed" : e.count >= 2 ? "busy" : "quiet";
    const label = level.charAt(0).toUpperCase() + level.slice(1);
    return `<div class="crowd-row">
      <span class="crowd-name">${e.name}</span>
      <span class="crowd-label">${label}</span>
      <span class="crowd-bar crowd-${level}"><i style="width:${pct}%"></i></span>
    </div>`;
  }).join("");
}

function updateBusyRings() {
  document.querySelectorAll(".pulse-ring").forEach(el => el.remove());
  const busy = PLACES.map(([id]) => ({ id, count: CROWD_DATA[id] || 0 }))
    .filter(e => e.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  busy.forEach(({ id }) => {
    const p = P[id];
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", "25");
    circle.setAttribute("class", "pulse-ring");
    if (reducedMotion) { circle.style.animation = "none"; circle.style.opacity = "0.3"; circle.style.r = "30"; }
    $("tiles").parentNode.insertBefore(circle, $("tiles"));
  });
}

function startCrowdPolling() {
  if (crowdTimer) clearInterval(crowdTimer);
  fetchCrowd();
  crowdTimer = setInterval(fetchCrowd, 20000);
}

/* ===== REAL CHECK-IN (separate from game) ===== */
const REAL_CHECKIN_COOLDOWN = {};
function initRealCheckin() {
  const sel = $("realPlace");
  PLACES.forEach(([id, name]) => { const o = document.createElement("option"); o.value = id; o.textContent = name; sel.appendChild(o); });
  $("realCheckinBtn").onclick = () => {
    const pid = sel.value;
    if (!pid) { toast("Pick a place first!"); return; }
    const user = currentEmail() || "anon";
    const key = pid + "_" + user;
    const now = Date.now();
    if (REAL_CHECKIN_COOLDOWN[key] && now - REAL_CHECKIN_COOLDOWN[key] < 600000) {
      toast("You already checked in here. Wait 10 min."); return;
    }
    REAL_CHECKIN_COOLDOWN[key] = now;
    if (apiOk()) {
      apiPost("/checkin", { placeId: pid, real: true }).then(() => {
        toast("📍 Checked in at " + P[pid].name + "!");
        fetchCrowd();
      }).catch(() => toast("Check-in failed. Try again."));
    } else {
      CROWD_DATA[pid] = (CROWD_DATA[pid] || 0) + 2;
      renderCrowdPanel();
      toast("📍 Checked in at " + P[pid].name + " (offline)");
    }
  };
}

/* ===== SEED DEMO DATA (console function) ===== */
window.seedDemoData = async function() {
  const weighted = ["dh1","dh1","dh1","dh2","dh2","dh2","lib","lib","lib","lib","nes","nes","grub","anb","cnd"];
  const promises = weighted.map(pid => {
    if (apiOk()) {
      return apiPost("/checkin", { placeId: pid, real: true });
    } else {
      CROWD_DATA[pid] = (CROWD_DATA[pid] || 0) + 2;
      return Promise.resolve();
    }
  });
  await Promise.all(promises);
  if (!apiOk()) { renderCrowdPanel(); updateBusyRings(); buildTicker(); }
  else fetchCrowd();
  console.log("✅ 15 demo check-ins seeded (mess + library heavy)");
};

/* ===== INIT ===== */
function init() {
  S = { t: 0, cash: START_CASH, hold: {}, loc: "gate", sel: "gate", walk: null, pos: null, seen: new Set(["gate"]), over: false, msg: "" };
  PLACES.forEach(([id]) => { const p = P[id]; p.pr = 0; p.pend = 0; p.p = target(p); p.open = p.p; });
  $("news").innerHTML = ""; $("end").style.display = "none";
  news("Campus opens at 08:00. You're at Gate 1 with " + inr(START_CASH) + ".");
  buildMap(); render(); msg("Tap a building, walk there, then buy or sell. Walking costs campus time.");
  clearInterval(loop); acc = 0; loop = setInterval(frame, 100);
  if (apiOk()) startCrowdPolling();
  buildTicker();
  initHow();
}
function buildMap() {
  const road = (d, w, c) => `<path d="${d}" stroke="${c}" stroke-width="${w}"/>`;
  const lines = ["M500 610V270", "M40 270H960", "M150 505H900", "M210 270V545", "M780 270V545"];
  $("roads").innerHTML = lines.map(d => road(d, 30, "#e1ddd1")).join("") + lines.map(d => road(d, 22, "#fff")).join("");
  let seed = 7, r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280, trees = "";
  for (let i = 0; i < 70; i++) {
    const x = 20 + r() * 960, y = 20 + r() * 580;
    if (PLACES.some(([, , , px, py]) => Math.hypot(px - x, py - y) < 46) || Math.hypot(610 - x, 130 - y) < 110 || [500, 210, 780].some(v => Math.abs(x - v) < 24 && y > 262) || [270, 505].some(v => Math.abs(y - v) < 22)) continue;
    trees += `<circle cx="${x}" cy="${y}" r="${7 + r() * 6}" fill="#c8e6b8" stroke="#8cbc7c" stroke-width="2"/>`;
  }
  $("trees").innerHTML = trees;
  $("tiles").innerHTML = "";
  PLACES.forEach(([id]) => {
    const p = P[id], [w, h] = SIZE[p.cat] || [40, 28], col = CATS[p.cat].c, g = document.createElementNS(NS, "g");
    g.setAttribute("class", "tile"); g.dataset.id = id; g.setAttribute("transform", `translate(${p.x},${p.y})`);
    g.innerHTML = `<ellipse class="ring" cy="6" rx="${w / 2 + 9}" ry="${h / 2 + 9}" fill="#fff6" stroke="#1a1f2b" stroke-width="2" stroke-dasharray="5 4"/>
      <rect x="${-w / 2}" y="${-h / 2 + 7}" width="${w}" height="${h}" rx="0" fill="${col}" style="filter:brightness(.62)"/>
      <g class="top"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="0" fill="${col}" stroke="#1a1f2b" stroke-width="3"/>
      <rect x="${-w / 2 + 6}" y="${-h / 2 + 6}" width="${w - 12}" height="5" rx="0" fill="#fff" opacity=".4"/></g>
      <text class="lbl" y="${h / 2 + 20}">${p.name}</text>
      <g class="pin" transform="translate(0,${-h / 2 - 20})"><path d="M-5 9L0 16L5 9Z" fill="#D62FA8" stroke="#1a1f2b" stroke-width="1.5"/>
      <rect x="-30" y="-11" width="60" height="21" rx="0" fill="#fff" stroke="#1a1f2b" stroke-width="1.5"/><rect x="-6" y="7" width="12" height="4" fill="#fff"/>
      <text id="t_${id}" class="pt" y="4"></text></g>`;
    $("tiles").appendChild(g);
  });
  $("tiles").onclick = e => { const g = e.target.closest(".tile"); if (g) { S.sel = g.dataset.id; render(); } };
}
function news(t) { const p = document.createElement("p"); p.innerHTML = `<small>${fmtH(hour())}</small> `; p.append(t); $("news").prepend(p); }
function toast(t) { const e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove("on"), 3800); }
function msg(t) { S.msg = t; const m = $("msg"); if (m) m.textContent = t; }
function frame() {
  if (S.over) return;
  if (S.walk) {
    const w = S.walk; w.el += .1; const k = Math.min(1, w.el / w.dur), a = P[w.from], b = P[w.to];
    S.pos = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    $("trail").setAttribute("d", `M${a.x} ${a.y}L${b.x} ${b.y}`);
    if (k >= 1) { S.loc = w.to; S.walk = null; S.pos = null; $("trail").setAttribute("d", ""); arrive(w.to); }
  }
  acc += .1; if (acc >= .999) { acc = 0; tick(); }
  const q = S.pos || P[S.loc]; $("me").setAttribute("transform", `translate(${q.x},${q.y - (S.walk ? 6 : 26)})`);
  $("me").classList.toggle("walking", !!S.walk);
}
function arrive(id) {
  S.sel = id;
  if (!S.seen.has(id)) {
    S.seen.add(id);
    S.cash += 100;
    news("Checked in at " + P[id].name + ": +₹100.");
    toast("✅ Checked in at " + P[id].name + "  +₹100");
    if (apiOk()) {
      apiPost("/checkin", { placeId: id }).catch(() => {});
    }
    // Show rating card after check-in
    showRatingCard(id);
  }
  msg("You're at " + P[id].name + ". You can trade here."); render();
}
function tick() {
  S.t++;
  PLACES.forEach(([id]) => { const p = P[id]; p.pr *= .985; p.p = Math.max(1, p.p + (target(p) - p.p) * .18 + p.p * .018 * randn()); });
  Object.keys(S.hold).forEach(k => { S.cash += S.hold[k].q * P[k].p * .002; });
  if (S.t % 14 === 0 || Math.random() < .03) {
    const [txt, fx] = EVENTS[Math.floor(Math.random() * EVENTS.length)]; news(txt); toast(txt);
    Object.keys(fx).forEach(k => PLACES.forEach(([id, , cat]) => { if (k === id || k === "@" + cat) P[id].p = Math.max(1, P[id].p * (1 + fx[k])); }));
  }
  if (S.t % 5 === 0) buildTicker();
  render(); if (S.t >= GAME_SEC) finish();
}
function render() {
  tint(hour());
  PLACES.forEach(([id]) => {
    const p = P[id], c = (p.p / p.open - 1) * 100, e = $("t_" + id);
    e.textContent = "₹" + p.p.toFixed(0) + (c >= 0 ? " ▲" : " ▼"); e.setAttribute("fill", c >= 0 ? "#347A57" : "#e5484d");
    e.parentNode.parentNode.classList.toggle("sel", id === S.sel);
  });
  $("clock").textContent = fmtH(hour()); $("cash").textContent = inr(S.cash);
  const w = worth(); $("net").textContent = inr(w); $("net").style.color = w >= START_CASH ? "var(--up)" : "var(--down)";
  $("visits").textContent = S.seen.size + "/" + PLACES.length;
  const p = P[S.sel], cat = CATS[p.cat], c = (p.p / p.open - 1) * 100, h = S.hold[p.id] || { q: 0, avg: 0 }, here = S.loc === p.id && !S.walk;
  const crowd = p.pr > 4 ? "buying heavily, prices climbing" : p.pr < -4 ? "selling off, prices sinking" : "quiet";
  const secs = Math.ceil(dist(P[S.loc], p) / SPEED);
  // Rating info for selected place
  const ri = PLACE_RATINGS[p.id];
  const ratingHtml = ri ? `<div class="dim" style="margin-top:6px">Rating: ${"★".repeat(Math.round(ri.avg))}${"☆".repeat(5 - Math.round(ri.avg))} ${ri.avg.toFixed(1)} · ${ri.tag || "—"}</div>` : "";
  $("card").innerHTML = `<div class="card-label">MARKET</div><span class="kind" style="background:${cat.c}">${cat.n}</span><div class="nm">${p.name}</div>
    <div class="price ${c >= 0 ? "up" : "down"}">₹${p.p.toFixed(2)}<small>${c >= 0 ? "▲" : "▼"} ${Math.abs(c).toFixed(1)}% today</small></div>
    <div class="dim" style="margin-top:8px">How busy it is right now</div><div class="meter"><i style="width:${Math.min(100, demand(p.cat, hour()) * 85)}%"></i></div>
    <div class="dim">${cat.t}</div>
    <div class="dim" style="margin-top:6px">Crowd: <b style="color:var(--ink)">${crowd}</b></div>
    ${ratingHtml}
    <div class="dim" style="margin-top:8px">You hold <b style="color:var(--ink)">${h.q}</b> shares${h.q ? " (avg ₹" + h.avg.toFixed(2) + ")" : ""}</div>
    ${here ? `<div class="row"><select id="qty" aria-label="Shares"><option>1</option><option>5</option><option>10</option></select><button class="buy" id="buy">Buy</button><button class="sell" id="sell">Sell</button></div>`
      : `<div class="row"><button class="go" id="go" ${S.walk ? "disabled" : ""}>${S.walk ? "Walking..." : "Walk here · about " + secs + "s"}</button></div>`}
    <div id="msg">${S.msg}</div>`;
  if ($("go")) $("go").onclick = () => { S.walk = { from: S.loc, to: p.id, el: 0, dur: Math.max(.5, dist(P[S.loc], p) / SPEED) }; S.pos = { x: P[S.loc].x, y: P[S.loc].y }; msg("Walking to " + p.name + "..."); render(); };
  if ($("buy")) { $("buy").onclick = () => trade(1); $("sell").onclick = () => trade(-1); }
  $("port").innerHTML = Object.keys(S.hold).filter(k => S.hold[k].q > 0).map(k => {
    const x = S.hold[k], pl = (P[k].p - x.avg) * x.q;
    return `<div><span>${P[k].name} × ${x.q}</span><b class="${pl >= 0 ? "up" : "down"}">${pl >= 0 ? "+" : "-"}${inr(Math.abs(pl))}</b></div>`;
  }).join("") || `<div class="empty-sticker">📦 Nothing yet. Walk somewhere and buy.</div>`;
}
function trade(side) {
  const p = P[S.sel], q = +$("qty").value, h = S.hold[p.id] || (S.hold[p.id] = { q: 0, avg: 0 });
  if (side > 0) {
    const cost = p.p * q; if (cost > S.cash) { msg("Not enough cash. Try fewer shares."); return render(); }
    h.avg = (h.avg * h.q + cost) / (h.q + q); h.q += q; S.cash -= cost; p.pr += q; p.p *= 1 + q * .004;
    msg("Bought " + q + " at ₹" + p.p.toFixed(2) + ".");
    toast("💰 Bought " + q + " shares of " + p.name);
  } else {
    if (q > h.q) { msg("You don't hold that many here."); return render(); }
    h.q -= q; S.cash += p.p * q; p.pr -= q; p.p *= 1 - q * .004;
    msg("Sold " + q + " at ₹" + p.p.toFixed(2) + ".");
    toast("📤 Sold " + q + " shares of " + p.name);
  }
  render();
}
function finish() {
  S.over = true; clearInterval(loop); if (crowdTimer) clearInterval(crowdTimer);
  const w = worth(), pl = w - START_CASH;
  $("endT").textContent = pl > 4000 ? "Chancellor of Campus Capital" : pl > 1000 ? "Profitable Fresher" : pl > -1000 ? "Still Finding the Canteen" : "Please Stick to Chai";
  $("endP").textContent = "Net worth " + inr(w) + " (" + (pl >= 0 ? "+" : "-") + inr(Math.abs(pl)) + "). You checked in at " + S.seen.size + " of " + PLACES.length + " places. Screenshot this and challenge a friend.";
  saveScore(w);
  $("end").style.display = "grid";
}

/* ===== RATINGS ===== */
let PLACE_RATINGS = {};
let selectedRatingStars = 0, selectedRatingTag = "";

function showRatingCard(placeId) {
  const rc = $("ratingCard");
  if (!rc) return;
  rc.style.display = "block";
  rc.dataset.place = placeId;
  selectedRatingStars = 0; selectedRatingTag = "";
  document.querySelectorAll("#ratingStars button").forEach(b => { b.textContent = "☆"; b.classList.remove("active"); });
  document.querySelectorAll("#ratingTags .tag-chip").forEach(b => b.classList.remove("active"));
  fetchPlaceRating(placeId);
}

document.querySelectorAll("#ratingStars button").forEach(btn => {
  btn.onclick = () => {
    selectedRatingStars = +btn.dataset.star;
    document.querySelectorAll("#ratingStars button").forEach((b, i) => {
      b.textContent = i < selectedRatingStars ? "★" : "☆";
      b.classList.toggle("active", i < selectedRatingStars);
    });
  };
});
document.querySelectorAll("#ratingTags .tag-chip").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("#ratingTags .tag-chip").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedRatingTag = btn.dataset.tag;
  };
});
if ($("submitRating")) $("submitRating").onclick = () => {
  const pid = $("ratingCard").dataset.place;
  if (!selectedRatingStars) { toast("Pick a star rating!"); return; }
  if (apiOk()) {
    apiPost("/rating", { placeId: pid, stars: selectedRatingStars, tag: selectedRatingTag })
      .then(() => { toast("⭐ Rating saved!"); $("ratingCard").style.display = "none"; fetchPlaceRating(pid); })
      .catch(() => toast("Failed to save rating."));
  } else {
    // Offline fallback
    PLACE_RATINGS[pid] = { avg: selectedRatingStars, tag: selectedRatingTag };
    toast("⭐ Rating saved (offline)");
    $("ratingCard").style.display = "none";
    render();
  }
};

async function fetchPlaceRating(placeId) {
  if (!apiOk()) return;
  try {
    const data = await apiGet("/ratings?placeId=" + placeId);
    if (data && data.avg !== undefined) {
      PLACE_RATINGS[placeId] = { avg: data.avg, tag: data.topTag || "" };
      $("placeRatingInfo").textContent = "Avg: " + data.avg.toFixed(1) + " ★ · Top tag: " + (data.topTag || "—");
      render();
    }
  } catch (e) { /* silent */ }
}

/* ===== Players (localStorage + API) ===== */
const DB_KEY = "snu_exchange_v1";
const loadDB = () => { try { return JSON.parse(localStorage.getItem(DB_KEY)) || { games: 0, best: null } } catch (e) { return { games: 0, best: null } } };
const saveDB = db => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); return true } catch (e) { return false } };
let PLAYER = null, REMOTE_LB = null;

async function fetchLeaderboard() {
  try {
    if (apiOk()) {
      const data = await apiGet("/leaderboard");
      REMOTE_LB = data.map(r => ({ name: r.displayName || r.username, best: r.bestScore }));
    }
  } catch (e) { /* silent, localStorage fallback */ }
  renderLb();
}

function renderLb() {
  const rows = REMOTE_LB || (loadDB().best !== null ? [{ name: currentName(), best: loadDB().best }] : []);
  const html = rows.length ? rows.map((u, i) => `<div><span>${i + 1}. ${(u.name || "").replace(/[<>&]/g, "")}</span><b>${inr(u.best)}</b></div>`).join("") : `<div class="empty-sticker">🏆 No scores yet. Be the first.</div>`;
  $("lb").innerHTML = html; $("endLb").innerHTML = html;
}

/* ===== AUTH UI ===== */
let authMode = "login"; // "login" or "signup"

function setupAuthToggle() {
  const loginBtn = $("authLoginBtn"), signupBtn = $("authSignupBtn");
  if (!loginBtn || !signupBtn) return;
  loginBtn.onclick = () => setAuthMode("login");
  signupBtn.onclick = () => setAuthMode("signup");
}

function setAuthMode(mode) {
  authMode = mode;
  const loginBtn = $("authLoginBtn"), signupBtn = $("authSignupBtn");
  loginBtn.classList.toggle("active", mode === "login");
  signupBtn.classList.toggle("active", mode === "signup");
  $("signupFields").style.display = mode === "signup" ? "block" : "none";
  $("signupFields2").style.display = mode === "signup" ? "block" : "none";
  $("authTitle").textContent = mode === "login" ? "Log in" : "Create account";
  $("lgo").textContent = mode === "login" ? "Log in" : "Create account";
  $("lerr").textContent = "";
}

function showLogin() {
  S && (S.over = true); clearInterval(loop); $("end").style.display = "none";
  setAuthMode("login");
  if ($("aemail")) $("aemail").value = "";
  if ($("apw")) $("apw").value = "";
  if ($("apw2")) $("apw2").value = "";
  if ($("aname")) $("aname").value = "";
  $("lerr").textContent = "";
  $("login").style.display = "grid";
  setupAuthToggle();
  ($("aemail") || $("lgo")).focus();
}

function updateHeaderUser() {
  const info = $("userInfo");
  const btn = $("logoutBtn");
  if (AUTH_USER) {
    if (info) info.textContent = AUTH_USER.name;
    if (btn) btn.style.display = "inline-block";
  } else {
    if (info) info.textContent = "";
    if (btn) btn.style.display = "none";
  }
}

function logout() {
  AUTH_TOKEN = null;
  AUTH_USER = null;
  localStorage.removeItem("snu_token");
  localStorage.removeItem("snu_user");
  updateHeaderUser();
  showLogin();
}

async function doAuth() {
  const err = t => ($("lerr").textContent = t);
  const emailVal = ($("aemail").value || "").trim().toLowerCase();
  const pw = ($("apw").value || "");

  if (!emailVal.endsWith("@snu.edu.in")) return err("Use your @snu.edu.in email.");
  if (pw.length < 6) return err("Password must be at least 6 characters.");

  if (authMode === "signup") {
    const name = ($("aname").value || "").trim();
    const pw2 = ($("apw2").value || "");
    if (name.length < 2) return err("Enter a name with at least 2 characters.");
    if (pw !== pw2) return err("Passwords don't match.");

    if (apiOk()) {
      try {
        const res = await apiPost("/signup", { email: emailVal, name, password: pw });
        AUTH_TOKEN = res.token;
        AUTH_USER = { email: res.email, name: res.name };
        localStorage.setItem("snu_token", AUTH_TOKEN);
        localStorage.setItem("snu_user", JSON.stringify(AUTH_USER));
      } catch (e) {
        return err(e.body?.error || "Signup failed.");
      }
    } else {
      // Offline fallback
      AUTH_USER = { email: emailVal, name };
      localStorage.setItem("snu_user", JSON.stringify(AUTH_USER));
    }
  } else {
    // Login
    if (apiOk()) {
      try {
        const res = await apiPost("/login", { email: emailVal, password: pw });
        AUTH_TOKEN = res.token;
        AUTH_USER = { email: res.email, name: res.name };
        localStorage.setItem("snu_token", AUTH_TOKEN);
        localStorage.setItem("snu_user", JSON.stringify(AUTH_USER));
      } catch (e) {
        return err(e.body?.error || "Wrong email or password.");
      }
    } else {
      // Offline fallback: check localStorage
      const existing = localStorage.getItem("snu_user");
      if (existing) {
        AUTH_USER = JSON.parse(existing);
      } else {
        AUTH_USER = { email: emailVal, name: emailVal.split("@")[0] };
        localStorage.setItem("snu_user", JSON.stringify(AUTH_USER));
      }
    }
  }

  PLAYER = AUTH_USER.email;
  $("who").textContent = AUTH_USER.name;
  updateHeaderUser();
  $("login").style.display = "none";
  fetchLeaderboard();
  init();
}

function saveScore(w) {
  if (apiOk()) {
    apiPost("/score", { score: Math.round(w) })
      .then(() => { toast("🏆 Score saved!"); fetchLeaderboard(); })
      .catch(() => {});
  }
  const db = loadDB();
  const first = db.best === null, better = first || w > db.best;
  db.games = (db.games || 0) + 1; if (better) db.best = w;
  saveDB(db); renderLb();
  $("endP").textContent += better ? (first ? " First score saved." : " New personal best!") : " Your best is " + inr(db.best) + ".";
}

/* ===== CONNECT TAB ===== */
let MY_PROFILE = null, WAVE_TIMER = null;
const SAMPLE_STUDENTS = [
  { username: "arjun_k", department: "CSE", batch: "2025", interests: ["Coding", "AI/ML", "Gaming"], avatarColor: "#3a56e8" },
  { username: "priya_m", department: "ECE", batch: "2025", interests: ["Robotics", "Music", "Photography"], avatarColor: "#19b36a" },
  { username: "rahul_s", department: "Design", batch: "2024", interests: ["Art", "Photography", "Startups"], avatarColor: "#ff6b3d" },
  { username: "neha_r", department: "Economics", batch: "2026", interests: ["Finance", "Reading", "Dance"], avatarColor: "#D62FA8" },
  { username: "aman_t", department: "Physics", batch: "2023", interests: ["Coding", "Music", "Sports"], avatarColor: "#f5c518" },
  { username: "divya_p", department: "Biotech", batch: "2025", interests: ["Reading", "Dance", "Art"], avatarColor: "#e5484d" },
];

function loadConnect() {
  MY_PROFILE = JSON.parse(localStorage.getItem("snu_profile") || "null");
  if (MY_PROFILE) {
    $("profilePrompt").style.display = "none";
    $("connectFilters").style.display = "flex";
    fetchStudents();
    startWavePolling();
  } else {
    $("profilePrompt").style.display = "block";
    $("connectFilters").style.display = "none";
    $("studentGrid").innerHTML = `<div class="empty-sticker">👋 Set up your profile to discover other students.</div>`;
  }
}

$("openProfileModal").onclick = () => { $("profileModal").style.display = "grid"; };
$("closeProfileModal").onclick = () => { $("profileModal").style.display = "none"; };

// Interest chip selection
document.querySelectorAll("#profInterests .tag-chip").forEach(btn => {
  btn.onclick = () => {
    const active = document.querySelectorAll("#profInterests .tag-chip.active");
    if (!btn.classList.contains("active") && active.length >= 5) { toast("Max 5 interests!"); return; }
    btn.classList.toggle("active");
  };
});

$("saveProfile").onclick = async () => {
  const dept = $("profDept").value, batch = $("profBatch").value;
  const interests = [...document.querySelectorAll("#profInterests .tag-chip.active")].map(b => b.dataset.int);
  if (!dept || !batch) { toast("Pick department and batch!"); return; }
  MY_PROFILE = { username: currentEmail(), displayName: currentName(), department: dept, batch, interests, avatarColor: "#D62FA8" };
  localStorage.setItem("snu_profile", JSON.stringify(MY_PROFILE));
  if (apiOk()) {
    apiPost("/profile", { department: dept, batch, interests, avatarColor: "#D62FA8" }).then(() => toast("✅ Profile saved!")).catch(() => {});
  } else { toast("✅ Profile saved (offline)"); }
  $("profileModal").style.display = "none";
  loadConnect();
};

async function fetchStudents() {
  const grid = $("studentGrid");
  const dept = $("filterDept").value, batch = $("filterBatch").value;
  const diffDept = $("filterDiffDept").checked;
  let students;
  try {
    if (apiOk()) {
      let q = "/students?";
      if (dept) q += "department=" + dept + "&";
      if (batch) q += "batch=" + batch;
      students = await apiGet(q);
    } else throw "offline";
  } catch (e) {
    students = SAMPLE_STUDENTS;
  }
  // Filter out self
  students = students.filter(s => s.username !== MY_PROFILE?.username);
  if (diffDept && MY_PROFILE) students = students.filter(s => s.department !== MY_PROFILE.department);
  if (!students.length) {
    grid.innerHTML = `<div class="empty-sticker">🔍 No students found. Try different filters.</div>`;
    return;
  }
  grid.innerHTML = students.map(s => {
    const shared = MY_PROFILE ? (s.interests || []).filter(i => MY_PROFILE.interests.includes(i)).length : 0;
    const dispName = s.displayName || s.username || "?";
    return `<div class="student-card">
      <div class="avatar" style="background:${s.avatarColor || "#D62FA8"}">${(dispName)[0].toUpperCase()}</div>
      ${shared ? `<div class="s-badge">${shared} shared</div>` : ""}
      <div class="s-name">${dispName.replace(/[<>&]/g, "")}</div>
      <div class="s-dept">${s.department || ""} · ${s.batch || ""}</div>
      <div class="s-interests">${(s.interests || []).join(", ")}</div>
      <button class="wave-btn" onclick="sendWave('${s.username}')">👋 Wave</button>
    </div>`;
  }).join("");
}

$("filterDept").onchange = fetchStudents;
$("filterBatch").onchange = fetchStudents;
$("filterDiffDept").onchange = fetchStudents;

window.sendWave = async function(toUser) {
  if (apiOk()) {
    apiPost("/wave", { toUser }).then(() => toast("👋 Waved at " + toUser + "!")).catch(() => toast("Wave failed."));
  } else { toast("👋 Waved at " + toUser + " (offline)"); }
};

function startWavePolling() {
  if (WAVE_TIMER) clearInterval(WAVE_TIMER);
  fetchWaves();
  WAVE_TIMER = setInterval(fetchWaves, 30000);
}

async function fetchWaves() {
  if (!currentEmail()) return;
  try {
    if (!apiOk()) throw "offline";
    const data = await apiGet("/waves?user=" + currentEmail());
    const bell = $("waveBell");
    $("waveCount").textContent = data.length;
    bell.classList.toggle("has-waves", data.length > 0);
    $("waveList").innerHTML = data.length ? data.map(w =>
      `<div style="padding:4px 0;border-top:1px solid #0000000f;font-size:12px"><b>${w.fromUser}</b> waved · ${new Date(w.timestamp * 1000).toLocaleTimeString()}</div>`
    ).join("") : `<div class="empty-sticker">No waves yet.</div>`;
  } catch (e) {
    $("waveBell").classList.remove("has-waves");
  }
}

$("waveBell").onclick = () => {
  const wp = $("wavePanel");
  wp.style.display = wp.style.display === "none" ? "block" : "none";
};

/* ===== LOST & FOUND TAB ===== */
let LF_ITEMS = [];
const SAMPLE_ITEMS = [
  { itemId: "s1", type: "lost", title: "Blue water bottle", description: "Lost near A Block after 10am class", placeId: "a", reportedBy: "arjun", contact: "arjun@snu.edu.in", status: "open", createdAt: Date.now()/1000 - 3600 },
  { itemId: "s2", type: "found", title: "Black umbrella", description: "Found at CnD counter", placeId: "cnd", reportedBy: "priya", contact: "priya@snu.edu.in", status: "open", createdAt: Date.now()/1000 - 7200 },
  { itemId: "s3", type: "lost", title: "Notebook with green cover", description: "Left in Central Library 2nd floor", placeId: "lib", reportedBy: "rahul", contact: "wa.me/91xxxxxxxxxx", status: "open", createdAt: Date.now()/1000 - 1800 },
  { itemId: "s4", type: "found", title: "ID card - Neha R.", description: "Found on basketball court bench", placeId: "bask", reportedBy: "aman", contact: "aman@snu.edu.in", status: "open", createdAt: Date.now()/1000 - 600 },
];

function initLfDropdowns() {
  [$("lfPlace"), $("lfFilterPlace")].forEach(sel => {
    if (sel.options.length > 1) return;
    PLACES.forEach(([id, name]) => { const o = document.createElement("option"); o.value = id; o.textContent = name; sel.appendChild(o); });
  });
}

async function loadLostFound() {
  initLfDropdowns();
  const place = $("lfFilterPlace").value, type = $("lfFilterType").value;
  try {
    if (!apiOk()) throw "offline";
    let q = "/items?";
    if (place) q += "placeId=" + place + "&";
    if (type) q += "type=" + type + "&";
    q += "status=open";
    LF_ITEMS = await apiGet(q);
  } catch (e) {
    LF_ITEMS = SAMPLE_ITEMS;
  }
  let items = LF_ITEMS;
  if (place) items = items.filter(i => i.placeId === place);
  if (type === "mine") items = items.filter(i => i.reportedBy === currentEmail());
  else if (type) items = items.filter(i => i.type === type);
  renderLfGrid(items);
  updateLostBadges(items);
}

function renderLfGrid(items) {
  const grid = $("lfGrid");
  if (!items.length) {
    grid.innerHTML = `<div class="empty-sticker">🎒 No items reported. Campus is tidy!</div>`;
    return;
  }
  const myEmail = currentEmail();
  grid.innerHTML = items.map(it => {
    const ago = timeAgo(it.createdAt);
    const pName = P[it.placeId] ? P[it.placeId].name : it.placeId;
    const isMine = it.reportedBy === myEmail;
    const reporterDisplay = it.reporterName || it.reportedBy || "";
    return `<div class="lf-card">
      <div class="lf-tag ${it.type}">${it.type.toUpperCase()}</div>
      ${isMine ? '<span class="lf-mine-tag">Mine</span>' : ''}
      <div class="lf-title">${(it.title || "").replace(/[<>&]/g, "")}</div>
      <div class="lf-desc">${(it.description || "").replace(/[<>&]/g, "")}</div>
      <div class="lf-place">📍 ${pName}</div>
      <div class="lf-time">${ago} · by ${reporterDisplay.replace(/[<>&]/g, "")}</div>
      <div class="lf-actions">
        <button class="btn-outline btn-sm" onclick="revealContact(this, '${(it.contact || "").replace(/'/g, "")}')">This is mine</button>
        ${it.status === "open" && isMine ? `<button class="btn-sm" style="background:#b9f0d0;border:2px solid var(--ink)" onclick="resolveItem('${it.itemId}', this)">Mark returned</button>` : ""}
        ${isMine ? `<button class="btn-sm" style="background:#ffd1d1;border:2px solid var(--ink)" onclick="deleteItem('${it.itemId}')">Delete</button>` : ""}
      </div>
      <div class="lf-contact-reveal"></div>
    </div>`;
  }).join("");
}

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

window.revealContact = function(btn, contact) {
  const reveal = btn.parentNode.parentNode.querySelector(".lf-contact-reveal");
  reveal.textContent = "📞 " + contact;
  reveal.style.display = "block";
};

window.resolveItem = async function(itemId, btn) {
  if (apiOk()) {
    apiPost("/items/resolve", { itemId }).then(() => { toast("✅ Marked as returned!"); loadLostFound(); }).catch(e => toast(e.body?.error || "Failed."));
  } else {
    btn.textContent = "Returned ✓";
    btn.disabled = true;
    toast("✅ Marked as returned (offline)");
  }
};

window.deleteItem = async function(itemId) {
  if (!confirm("Delete this item?")) return;
  if (apiOk()) {
    apiPost("/items/delete", { itemId }).then(() => { toast("🗑️ Item deleted."); loadLostFound(); }).catch(e => toast(e.body?.error || "Failed."));
  } else {
    LF_ITEMS = LF_ITEMS.filter(i => i.itemId !== itemId);
    renderLfGrid(LF_ITEMS);
    updateLostBadges(LF_ITEMS);
    toast("🗑️ Item deleted (offline)");
  }
};

function updateLostBadges(items) {
  const bg = $("lostBadges");
  if (!bg) return;
  bg.innerHTML = "";
  const counts = {};
  items.filter(i => i.status === "open").forEach(i => { counts[i.placeId] = (counts[i.placeId] || 0) + 1; });
  Object.keys(counts).forEach(pid => {
    const p = P[pid];
    if (!p) return;
    const g = document.createElementNS(NS, "g");
    g.setAttribute("transform", `translate(${p.x + 20},${p.y - 20})`);
    g.innerHTML = `<rect class="lost-badge-bg" x="-8" y="-8" width="16" height="16" rx="2"/>
      <text class="lost-badge" x="0" y="4" text-anchor="middle">${counts[pid]}</text>`;
    bg.appendChild(g);
  });
}

$("reportLost").onclick = () => { $("lfType").value = "lost"; $("lfModalTitle").textContent = "I lost something"; $("lfModal").style.display = "grid"; initLfDropdowns(); $("lfContact").value = currentEmail(); };
$("reportFound").onclick = () => { $("lfType").value = "found"; $("lfModalTitle").textContent = "I found something"; $("lfModal").style.display = "grid"; initLfDropdowns(); $("lfContact").value = currentEmail(); };
$("lfCancel").onclick = () => { $("lfModal").style.display = "none"; };

$("lfSubmit").onclick = async () => {
  const title = $("lfTitle").value.trim(), desc = $("lfDesc").value.trim(), place = $("lfPlace").value, contact = $("lfContact").value.trim(), type = $("lfType").value;
  if (!title || !place || !contact) { toast("Fill in title, place, and contact!"); return; }
  if (apiOk()) {
    apiPost("/items", { type, title, description: desc, placeId: place, contact })
      .then(() => { toast("✅ Report submitted!"); $("lfModal").style.display = "none"; loadLostFound(); })
      .catch(() => toast("Submission failed."));
  } else {
    LF_ITEMS.unshift({ itemId: "local_" + Date.now(), type, title, description: desc, placeId: place, reportedBy: currentName(), contact, status: "open", createdAt: Date.now() / 1000 });
    toast("✅ Report submitted (offline)");
    $("lfModal").style.display = "none";
    renderLfGrid(LF_ITEMS);
    updateLostBadges(LF_ITEMS);
  }
};

$("lfFilterPlace").onchange = loadLostFound;
$("lfFilterType").onchange = loadLostFound;

/* ===== BOOT ===== */
$("lgo").onclick = doAuth;
if ($("apw")) $("apw").addEventListener("keydown", e => { if (e.key === "Enter") doAuth(); });
if ($("aemail")) $("aemail").addEventListener("keydown", e => { if (e.key === "Enter") $("apw").focus(); });
if ($("logoutBtn")) $("logoutBtn").onclick = logout;
$("restart").onclick = init; $("again").onclick = init;
if ($("heroPlay")) $("heroPlay").onclick = () => { if (AUTH_USER) { document.querySelector("main").scrollIntoView({ behavior: "smooth" }); } else { showLogin(); } };
initRealCheckin();

// Auto-login if token exists
if (AUTH_TOKEN && AUTH_USER) {
  PLAYER = AUTH_USER.email;
  $("who").textContent = AUTH_USER.name;
  updateHeaderUser();
  $("login").style.display = "none";
  fetchLeaderboard();
  init();
} else {
  fetchLeaderboard();
  showLogin();
}
