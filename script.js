/* ===== API ===== */
const API_URL = "PASTE_URL_HERE";   // ← paste your HTTP API invoke URL here, e.g. "https://abc123.execute-api.ap-south-1.amazonaws.com"

/* ===== EDIT ME ===== */
const GAME_SEC = 240, START_CASH = 10000, SPEED = 140;
const BUCKET_URL = "";   // leave blank – we now use API_URL instead
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

/* ===== API helpers ===== */
async function apiGet(path) {
  const r = await fetch(API_URL + path);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(API_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

/* ===== Crowd polling (every 20s) ===== */
async function fetchCrowd() {
  try {
    CROWD_DATA = await apiGet("/crowd");
    renderCrowdPanel();
    updateBusyRings();
  } catch (e) { /* silent – game continues */ }
}

function renderCrowdPanel() {
  const panel = $("crowdPanel");
  if (!panel) return;
  const entries = PLACES.map(([id, name]) => ({ id, name, count: CROWD_DATA[id] || 0 }))
    .sort((a, b) => b.count - a.count)
    .filter(e => e.count > 0);

  if (entries.length === 0) {
    panel.innerHTML = `<div class="dim" style="border:0">No recent activity. Be the first to check in!</div>`;
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
  // Remove existing pulse rings
  document.querySelectorAll(".pulse-ring").forEach(el => el.remove());
  // Find the busiest places (top 3 with count > 0)
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
    if (reducedMotion) {
      circle.style.animation = "none";
      circle.style.opacity = "0.3";
      circle.style.r = "30";
    }
    $("tiles").parentNode.insertBefore(circle, $("tiles"));
  });
}

function startCrowdPolling() {
  if (crowdTimer) clearInterval(crowdTimer);
  fetchCrowd();
  crowdTimer = setInterval(fetchCrowd, 20000);
}

/* ===== INIT ===== */
function init() {
  S = { t: 0, cash: START_CASH, hold: {}, loc: "gate", sel: "gate", walk: null, pos: null, seen: new Set(["gate"]), over: false, msg: "" };
  PLACES.forEach(([id]) => { const p = P[id]; p.pr = 0; p.pend = 0; p.p = target(p); p.open = p.p; });
  $("news").innerHTML = ""; $("end").style.display = "none";
  news("Campus opens at 08:00. You're at Gate 1 with " + inr(START_CASH) + ".");
  buildMap(); render(); msg("Tap a building, walk there, then buy or sell. Walking costs campus time.");
  clearInterval(loop); acc = 0; loop = setInterval(frame, 100);
  if (API_URL && API_URL !== "PASTE_URL_HERE") startCrowdPolling();
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
      <g class="pin" transform="translate(0,${-h / 2 - 20})"><path d="M-5 9L0 16L5 9Z" fill="#ff3fb4" stroke="#1a1f2b" stroke-width="1.5"/>
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
    toast("Checked in at " + P[id].name + "  +₹100");
    // POST check-in to API
    if (API_URL && API_URL !== "PASTE_URL_HERE") {
      const username = $("who").textContent || "anon";
      apiPost("/checkin", { placeId: id, username }).catch(() => {});
    }
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
  render(); if (S.t >= GAME_SEC) finish();
}
function render() {
  tint(hour());
  PLACES.forEach(([id]) => {
    const p = P[id], c = (p.p / p.open - 1) * 100, e = $("t_" + id);
    e.textContent = "₹" + p.p.toFixed(0) + (c >= 0 ? " ▲" : " ▼"); e.setAttribute("fill", c >= 0 ? "#0d9a4f" : "#e5484d");
    e.parentNode.parentNode.classList.toggle("sel", id === S.sel);
  });
  $("clock").textContent = fmtH(hour()); $("cash").textContent = inr(S.cash);
  const w = worth(); $("net").textContent = inr(w); $("net").style.color = w >= START_CASH ? "var(--up)" : "var(--down)";
  $("visits").textContent = S.seen.size + "/" + PLACES.length;
  const p = P[S.sel], cat = CATS[p.cat], c = (p.p / p.open - 1) * 100, h = S.hold[p.id] || { q: 0, avg: 0 }, here = S.loc === p.id && !S.walk;
  const crowd = p.pr > 4 ? "buying heavily, prices climbing" : p.pr < -4 ? "selling off, prices sinking" : "quiet";
  const secs = Math.ceil(dist(P[S.loc], p) / SPEED);
  $("card").innerHTML = `<div class="card-label">MARKET</div><span class="kind" style="background:${cat.c}">${cat.n}</span><div class="nm">${p.name}</div>
    <div class="price ${c >= 0 ? "up" : "down"}">₹${p.p.toFixed(2)}<small>${c >= 0 ? "▲" : "▼"} ${Math.abs(c).toFixed(1)}% today</small></div>
    <div class="dim" style="margin-top:8px">How busy it is right now</div><div class="meter"><i style="width:${Math.min(100, demand(p.cat, hour()) * 85)}%"></i></div>
    <div class="dim">${cat.t}</div>
    <div class="dim" style="margin-top:6px">Crowd: <b style="color:var(--ink)">${crowd}</b></div>
    <div class="dim" style="margin-top:8px">You hold <b style="color:var(--ink)">${h.q}</b> shares${h.q ? " (avg ₹" + h.avg.toFixed(2) + ")" : ""}</div>
    ${here ? `<div class="row"><select id="qty" aria-label="Shares"><option>1</option><option>5</option><option>10</option></select><button class="buy" id="buy">Buy</button><button class="sell" id="sell">Sell</button></div>`
      : `<div class="row"><button class="go" id="go" ${S.walk ? "disabled" : ""}>${S.walk ? "Walking..." : "Walk here · about " + secs + "s"}</button></div>`}
    <div id="msg">${S.msg}</div>`;
  if ($("go")) $("go").onclick = () => { S.walk = { from: S.loc, to: p.id, el: 0, dur: Math.max(.5, dist(P[S.loc], p) / SPEED) }; S.pos = { x: P[S.loc].x, y: P[S.loc].y }; msg("Walking to " + p.name + "..."); render(); };
  if ($("buy")) { $("buy").onclick = () => trade(1); $("sell").onclick = () => trade(-1); }
  $("port").innerHTML = Object.keys(S.hold).filter(k => S.hold[k].q > 0).map(k => {
    const x = S.hold[k], pl = (P[k].p - x.avg) * x.q;
    return `<div><span>${P[k].name} × ${x.q}</span><b class="${pl >= 0 ? "up" : "down"}">${pl >= 0 ? "+" : "-"}${inr(Math.abs(pl))}</b></div>`;
  }).join("") || `<div class="dim" style="border:0">Nothing yet. Walk somewhere and buy.</div>`;
}
function trade(side) {
  const p = P[S.sel], q = +$("qty").value, h = S.hold[p.id] || (S.hold[p.id] = { q: 0, avg: 0 });
  if (side > 0) {
    const cost = p.p * q; if (cost > S.cash) { msg("Not enough cash. Try fewer shares."); return render(); }
    h.avg = (h.avg * h.q + cost) / (h.q + q); h.q += q; S.cash -= cost; p.pr += q; p.p *= 1 + q * .004; msg("Bought " + q + " at ₹" + p.p.toFixed(2) + ".");
  } else {
    if (q > h.q) { msg("You don't hold that many here."); return render(); }
    h.q -= q; S.cash += p.p * q; p.pr -= q; p.p *= 1 - q * .004; msg("Sold " + q + " at ₹" + p.p.toFixed(2) + ".");
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

/* ===== Players (localStorage + API) ===== */
const DB_KEY = "snu_exchange_v1";
const hashPin = s => { let h = 5381, g = 52711; for (const ch of s) { h = (h * 33 ^ ch.charCodeAt(0)) >>> 0; g = (g * 31 + ch.charCodeAt(0) * 7) >>> 0; } return h.toString(36) + g.toString(36); };
const loadDB = () => { try { return JSON.parse(localStorage.getItem(DB_KEY)) || { users: {} } } catch (e) { return { users: {} } } };
const saveDB = db => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); return true } catch (e) { return false } };
let PLAYER = null, REMOTE_LB = null;

async function fetchLeaderboard() {
  try {
    if (API_URL && API_URL !== "PASTE_URL_HERE") {
      const data = await apiGet("/leaderboard");
      REMOTE_LB = data.map(r => ({ name: r.username, best: r.bestScore }));
    }
  } catch (e) { /* silent, localStorage fallback */ }
  renderLb();
}

function renderLb() {
  const rows = REMOTE_LB || Object.values(loadDB().users).filter(u => u.best !== null).sort((a, b) => b.best - a.best).slice(0, 10);
  const html = rows.map((u, i) => `<div><span>${i + 1}. ${(u.name || "").replace(/[<>&]/g, "")}</span><b>${inr(u.best)}</b></div>`).join("") || `<div class="dim" style="border:0">No scores yet. Be the first.</div>`;
  $("lb").innerHTML = html; $("endLb").innerHTML = html;
}
function showLogin() {
  S && (S.over = true); clearInterval(loop); $("end").style.display = "none";
  $("lnote").textContent = "The leaderboard and crowd prices are shared with everyone online. Your PIN only protects your profile on this device.";
  $("lpin").value = ""; $("lerr").textContent = ""; $("login").style.display = "grid";
  try { $("lname").value = localStorage.getItem(DB_KEY + "_last") || ""; } catch (e) { }
  ($("lname").value ? $("lpin") : $("lname")).focus();
}
async function login() {
  const name = $("lname").value.trim(), pin = $("lpin").value.trim(), err = t => ($("lerr").textContent = t);
  if (name.length < 2) return err("Enter a name with at least 2 characters.");
  if (!/^\d{4}$/.test(pin)) return err("The PIN must be exactly 4 digits.");
  const db = loadDB(), key = name.toLowerCase(), ph = hashPin(key + ":" + pin);
  if (db.users[key] && db.users[key].pin !== ph) return err("Wrong PIN for that name.");
  if (!db.users[key]) db.users[key] = { name, pin: ph, best: null, games: 0, bestVisits: 0 };
  saveDB(db); try { localStorage.setItem(DB_KEY + "_last", name); } catch (e) { }
  PLAYER = key; $("who").textContent = db.users[key].name;
  $("login").style.display = "none"; fetchLeaderboard(); init();
}
function saveScore(w) {
  // POST to API (save only if higher is handled server-side)
  if (API_URL && API_URL !== "PASTE_URL_HERE") {
    const username = $("who").textContent.replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 20) || "player";
    apiPost("/score", { username, score: Math.round(w) })
      .then(() => fetchLeaderboard())
      .catch(() => {});
  }
  // Also save locally
  const db = loadDB(), u = db.users[PLAYER]; if (!u) return;
  const first = u.best === null, better = first || w > u.best;
  u.games++; if (better) u.best = w; u.bestVisits = Math.max(u.bestVisits || 0, S.seen.size);
  saveDB(db); renderLb();
  $("endP").textContent += better ? (first ? " First score saved." : " New personal best!") : " Your best is " + inr(u.best) + ".";
}
$("lgo").onclick = login;
$("lpin").addEventListener("keydown", e => { if (e.key === "Enter") login(); });
$("lname").addEventListener("keydown", e => { if (e.key === "Enter") $("lpin").focus(); });
$("switch").onclick = showLogin;
$("restart").onclick = init; $("again").onclick = init;
// Hero "Start playing" button scrolls to game if already logged in
if ($("heroPlay")) $("heroPlay").onclick = () => { if (PLAYER) { document.querySelector("main").scrollIntoView({ behavior: "smooth" }); } else { showLogin(); } };
fetchLeaderboard(); showLogin();

