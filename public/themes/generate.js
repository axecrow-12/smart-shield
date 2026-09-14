/**
 * Generates the 5 theme preview pages (preview-1.html ... preview-5.html).
 * Shared markup + realistic static data; per-theme design tokens and
 * background treatment. Run: node public/themes/generate.js
 */
const fs = require("fs");
const path = require("path");

/* ---------------- shared static content ---------------- */

const FEED_ROWS = [
  ["2:41 PM", "Unknown Vendor 47", "$420.00", 100, "rejected", "MULE_NETWORK"],
  ["2:39 PM", "Quick Cash Agent", "$350.00", 70, "review", "ACCOUNT_TAKEOVER"],
  ["2:36 PM", "Mbare Fresh Produce", "$18.50", 3, "approved", "—"],
  ["2:31 PM", "Border Electronics", "$240.00", 99, "rejected", "LOCATION_JUMP"],
  ["2:24 PM", "Split Deposit Agent", "$95.00", 95, "rejected", "SMURFING"],
  ["2:19 PM", "EcoTest Store", "$60.00", 2, "approved", "—"],
  ["2:12 PM", "Corner Grocery", "$32.00", 2, "approved", "—"],
];

const SHAP = [
  ["is_mule_destination", 1.76],
  ["is_legit_merchant", 1.61],
  ["receiver_risk_score", 1.02],
  ["amount", 0.35],
  ["Token_latency_seconds", -0.33],
];

const SCENARIOS = [
  ["✅", "Legitimate purchase", "Known device, home area"],
  ["📵", "OTP interception / SIM swap", "New device, 25s session, cycled SIM"],
  ["🕸️", "Mule network payout", "Known mule destination"],
  ["⚡", "Velocity / smurfing", "9 cash-ins in 24h"],
  ["🛰️", "Impossible travel", "450 km/h between transactions"],
  ["♻️", "Token replay", "Same QR presented twice"],
];

const SPARK = [12, 8, 22, 15, 40, 30, 70, 55, 92, 78, 100, 70, 25, 10, 38];

function qrSvg() {
  // deterministic fake QR pattern
  let rects = "";
  let seed = 7;
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      seed = (seed * 137 + 11) % 251;
      if (seed % 2) rects += `<rect x="${x * 6}" y="${y * 6}" width="6" height="6"/>`;
    }
  const finder = (fx, fy) =>
    `<rect x="${fx}" y="${fy}" width="42" height="42" fill="none" stroke="currentColor" stroke-width="8"/>` +
    `<rect x="${fx + 12}" y="${fy + 12}" width="18" height="18"/>`;
  return `<svg viewBox="0 0 126 126" width="132" height="132" fill="currentColor">${rects}${finder(0, 0)}${finder(84, 0)}${finder(0, 84)}</svg>`;
}

function sparkline(points, w = 260, h = 54) {
  const step = w / (points.length - 1);
  const pts = points.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / 100) * (h - 6) - 3).toFixed(1)}`);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark">
    <polyline points="${pts.join(" ")}" fill="none" stroke="url(#sparkGrad)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <polygon points="0,${h} ${pts.join(" ")} ${w},${h}" fill="url(#sparkFill)" opacity="0.25"/>
    <defs>
      <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="var(--good)"/><stop offset="1" stop-color="var(--bad)"/>
      </linearGradient>
      <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="transparent"/>
      </linearGradient>
    </defs>
  </svg>`;
}

function gauge(score) {
  const R = 64, C = 2 * Math.PI * R, frac = score / 100;
  return `<svg viewBox="0 0 160 160" class="gauge" width="170" height="170">
    <circle cx="80" cy="80" r="${R}" fill="none" stroke="var(--track)" stroke-width="13"/>
    <circle cx="80" cy="80" r="${R}" fill="none" stroke="url(#gaugeGrad)" stroke-width="13"
      stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}"
      transform="rotate(-90 80 80)"/>
    <defs><linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--amber)"/><stop offset="1" stop-color="var(--bad)"/>
    </linearGradient></defs>
    <text x="80" y="76" text-anchor="middle" class="gaugeNum">${score}</text>
    <text x="80" y="100" text-anchor="middle" class="gaugeLbl">RISK SCORE</text>
  </svg>`;
}

function donut() {
  const R = 34, C = 2 * Math.PI * R;
  const seg = (frac, off, color) =>
    `<circle cx="44" cy="44" r="${R}" fill="none" stroke="${color}" stroke-width="11"
      stroke-dasharray="${(C * frac - 2).toFixed(1)} ${C.toFixed(1)}"
      stroke-dashoffset="${(-C * off).toFixed(1)}" transform="rotate(-90 44 44)"/>`;
  return `<svg viewBox="0 0 88 88" width="92" height="92">
    ${seg(0.58, 0, "var(--good)")}${seg(0.13, 0.58, "var(--amber)")}${seg(0.29, 0.71, "var(--bad)")}
    <text x="44" y="41" text-anchor="middle" class="donutNum">24</text>
    <text x="44" y="55" text-anchor="middle" class="donutLbl">scored</text>
  </svg>`;
}

function body(theme) {
  const kpis = [
    ["24", "transactions scored"],
    ["6", "blocked"],
    ["25%", "block rate"],
    ["38", "avg risk"],
    ["0.945", "model AUC"],
  ];
  return `
<div class="bgfx">${theme.bgfx || ""}</div>
<div class="wrap">
<header>
  <div class="logo"><span class="logoIcon">🛡️</span> SmartPay <em>Shield</em></div>
  <div class="pills"><span class="pill ok">● backend</span><span class="pill ok">● ml api · LightGBM v4</span></div>
</header>

<div class="kpis">
  ${kpis.map(([v, l]) => `<div class="kpi glass"><div class="kpiVal">${v}</div><div class="kpiLbl">${l}</div></div>`).join("")}
</div>

<div class="grid">
  <div class="col">
    <div class="card glass">
      <h2>Merchant terminal</h2>
      <label>Merchant</label><div class="input">Mbare Fresh Produce</div>
      <label>Amount (USD)</label><div class="input">18.50</div>
      <div class="btn">Create payment request</div>
      <div class="qrBox">${qrSvg()}</div>
      <div class="tokenLine">token 39227411d7c64b8d96df198f519</div>
      <div class="expiry">expires in 9:41</div>
    </div>
  </div>

  <div class="col">
    <div class="card glass">
      <h2>Attack simulator</h2>
      <div class="scenarios">
        ${SCENARIOS.map(([i, t, d]) => `<div class="scenario"><span class="icon">${i}</span><span><b>${t}</b><br><span class="desc">${d}</span></span></div>`).join("")}
      </div>
    </div>
  </div>

  <div class="col wide">
    <div class="card glass verdict">
      <h2>Fraud engine verdict</h2>
      <div class="verdictRow">
        ${gauge(92)}
        <div class="verdictInfo">
          <span class="decision d-rejected">Mule network payout → REJECTED (BLOCK)</span>
          <div class="reasons"><span class="reason">MULE_NETWORK_DETECTION</span><span class="reason">HIGH_RISK_RECEIVER</span></div>
          <div class="exTitle">Why the model thinks so</div>
          ${SHAP.map(([n, c]) => {
            const pct = Math.min(50, Math.abs(c) / 1.76 * 50).toFixed(1);
            const bar = c > 0 ? `left:50%;width:${pct}%;background:var(--bad)` : `left:${50 - pct}%;width:${pct}%;background:var(--good)`;
            return `<div class="exRow"><span class="exName">${n}</span><span class="exTrack"><i style="${bar}"></i></span><span class="exVal" style="color:${c > 0 ? "var(--bad)" : "var(--good)"}">${c > 0 ? "+" : ""}${c.toFixed(2)}</span></div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <div class="card glass feed">
      <h2>Live transaction feed</h2>
      <div class="charts">
        <div class="chart">${donut()}<div class="legend">
          <span><i style="background:var(--good)"></i>approved 14</span>
          <span><i style="background:var(--amber)"></i>review 3</span>
          <span><i style="background:var(--bad)"></i>blocked 7</span></div>
        </div>
        <div class="chart grow"><div class="chartLbl">risk over time</div>${sparkline(SPARK)}</div>
      </div>
      <table>
        <thead><tr><th>Time</th><th>Merchant</th><th>Amount</th><th>Risk</th><th>Status</th><th>Signal</th></tr></thead>
        <tbody>
        ${FEED_ROWS.map(([t, m, a, r, s, sig]) => {
          const col = r >= 70 ? "var(--bad)" : r >= 40 ? "var(--amber)" : "var(--good)";
          return `<tr><td>${t}</td><td>${m}</td><td class="num">${a}</td>
            <td><span class="riskbar"><i style="width:${r}%;background:${col}"></i></span><span class="num">${r}</span></td>
            <td><span class="chip c-${s}">${s}</span></td><td class="sig">${sig}</td></tr>`;
        }).join("")}
        </tbody>
      </table>
    </div>
  </div>
</div>
<div class="themeTag">Theme ${theme.n} — ${theme.name}</div>
</div>`;
}

/* ---------------- shared structural CSS ---------------- */

const BASE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; font-family: var(--font); color: var(--text); background: var(--bg); overflow-x: hidden; }
.bgfx { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.orb { position: absolute; border-radius: 50%; filter: blur(90px); opacity: var(--orbOpacity, .55); }
.wrap { position: relative; z-index: 1; padding: 22px 26px; max-width: 1500px; margin: 0 auto; }
header { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
.logo { font-size: 21px; font-weight: 800; letter-spacing: .4px; }
.logo em { font-style: normal; color: var(--accent); }
.pills { margin-left: auto; display: flex; gap: 8px; }
.pill { padding: 4px 13px; border-radius: 999px; font-size: 12px; border: 1px solid var(--border); background: var(--pillBg); }
.pill.ok { color: var(--good); }
.glass { background: var(--cardBg); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--cardShadow); backdrop-filter: blur(var(--blur)); -webkit-backdrop-filter: blur(var(--blur)); }
.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi { padding: 14px 16px; }
.kpiVal { font-size: 26px; font-weight: 800; font-family: var(--numFont); color: var(--kpiColor, var(--text)); }
.kpiLbl { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .8px; margin-top: 2px; }
.grid { display: grid; grid-template-columns: 290px 330px 1fr; gap: 14px; align-items: start; }
.col { display: grid; gap: 14px; }
.card { padding: 18px; }
.card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1.4px; color: var(--muted); margin-bottom: 13px; font-weight: 700; }
label { display: block; font-size: 11px; color: var(--muted); margin: 9px 0 4px; }
.input { padding: 9px 11px; border-radius: calc(var(--radius) / 2); border: 1px solid var(--border); background: var(--inputBg); font-size: 14px; }
.btn { margin-top: 14px; text-align: center; padding: 11px; border-radius: calc(var(--radius) / 2); font-weight: 700; font-size: 14px; background: var(--btnBg); color: var(--btnText); box-shadow: var(--btnShadow, none); }
.qrBox { margin: 14px auto 0; width: 164px; padding: 16px; border-radius: 12px; background: var(--qrBg); color: var(--qrInk); display: flex; justify-content: center; }
.tokenLine { margin-top: 10px; text-align: center; font-family: var(--numFont); font-size: 10px; color: var(--muted); word-break: break-all; }
.expiry { text-align: center; font-size: 12px; color: var(--amber); margin-top: 5px; }
.scenarios { display: grid; gap: 9px; }
.scenario { display: flex; gap: 11px; align-items: center; padding: 10px 12px; border-radius: calc(var(--radius) / 1.6); border: 1px solid var(--border); background: var(--rowBg); font-size: 13px; }
.scenario .icon { font-size: 19px; }
.scenario .desc { font-size: 11px; color: var(--muted); }
.verdictRow { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
.gaugeNum { font-size: 40px; font-weight: 800; fill: var(--bad); font-family: var(--numFont); }
.gaugeLbl { font-size: 9px; letter-spacing: 2px; fill: var(--muted); }
.verdictInfo { flex: 1; min-width: 300px; }
.decision { display: inline-block; padding: 6px 14px; border-radius: 9px; font-weight: 700; font-size: 13px; }
.d-rejected { background: var(--badSoft); color: var(--bad); }
.reasons { margin: 10px 0; display: flex; flex-wrap: wrap; gap: 6px; }
.reason { font-size: 10px; font-family: var(--numFont); padding: 3px 9px; border-radius: 6px; border: 1px solid var(--border); background: var(--rowBg); color: var(--muted); }
.exTitle { font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--muted); margin: 10px 0 6px; }
.exRow { display: flex; align-items: center; gap: 8px; font-size: 11px; margin-top: 4px; }
.exName { width: 165px; text-align: right; font-family: var(--numFont); color: var(--muted); font-size: 10px; }
.exTrack { flex: 1; height: 8px; border-radius: 999px; background: var(--track); position: relative; overflow: hidden; }
.exTrack i { position: absolute; top: 0; bottom: 0; border-radius: 999px; }
.exVal { width: 44px; font-family: var(--numFont); font-size: 11px; }
.charts { display: flex; gap: 22px; align-items: center; margin-bottom: 14px; }
.chart { display: flex; gap: 12px; align-items: center; }
.chart.grow { flex: 1; display: block; }
.chartLbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 4px; }
.spark { width: 100%; height: 54px; display: block; }
.donutNum { font-size: 20px; font-weight: 800; fill: var(--text); font-family: var(--numFont); }
.donutLbl { font-size: 8px; fill: var(--muted); letter-spacing: 1px; }
.legend { display: grid; gap: 5px; font-size: 11px; color: var(--muted); }
.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); padding: 6px 8px; border-bottom: 1px solid var(--border); }
td { padding: 8px; border-bottom: 1px solid var(--rowBorder); }
.num { font-family: var(--numFont); }
.riskbar { width: 74px; height: 7px; background: var(--track); border-radius: 999px; overflow: hidden; display: inline-block; vertical-align: middle; margin-right: 7px; }
.riskbar i { display: block; height: 100%; border-radius: 999px; }
.chip { padding: 2px 10px; border-radius: 999px; font-size: 10.5px; font-weight: 700; }
.c-approved { background: var(--goodSoft); color: var(--good); }
.c-review { background: var(--amberSoft); color: var(--amber); }
.c-rejected { background: var(--badSoft); color: var(--bad); }
.sig { font-family: var(--numFont); font-size: 10px; color: var(--muted); }
.themeTag { margin-top: 18px; text-align: center; font-size: 12px; color: var(--muted); letter-spacing: 1px; }
`;

/* ---------------- themes ---------------- */

const orb = (c, size, x, y) =>
  `<div class="orb" style="background:${c};width:${size}px;height:${size}px;left:${x};top:${y}"></div>`;

const THEMES = [
  {
    n: 1, name: "Frost Sentinel", file: "preview-1.html",
    bgfx: orb("#2563eb", 420, "-6%", "-12%") + orb("#7c3aed", 380, "72%", "-8%") + orb("#0ea5e9", 340, "38%", "78%"),
    css: `
:root {
  --font: "Segoe UI", system-ui, sans-serif; --numFont: Consolas, monospace;
  --bg: radial-gradient(120% 120% at 20% 0%, #0d1428 0%, #070b16 55%, #04060c 100%);
  --text: #e9edf8; --muted: #8d97b8; --accent: #4f8cff;
  --good: #34d399; --amber: #fbbf24; --bad: #fb7185;
  --goodSoft: rgba(52,211,153,.14); --amberSoft: rgba(251,191,36,.14); --badSoft: rgba(251,113,133,.14);
  --cardBg: rgba(255,255,255,.055); --border: rgba(255,255,255,.13); --rowBorder: rgba(255,255,255,.06);
  --cardShadow: 0 8px 32px rgba(2,6,18,.45), inset 0 1px 0 rgba(255,255,255,.09);
  --blur: 18px; --radius: 16px;
  --inputBg: rgba(255,255,255,.06); --rowBg: rgba(255,255,255,.045); --pillBg: rgba(255,255,255,.06);
  --btnBg: linear-gradient(135deg, #4f8cff, #6d5cff); --btnText: #fff;
  --btnShadow: 0 6px 18px rgba(79,140,255,.35);
  --qrBg: rgba(255,255,255,.92); --qrInk: #0b1020; --track: rgba(255,255,255,.09);
}`,
  },
  {
    n: 2, name: "Aurora Glass", file: "preview-2.html",
    bgfx: orb("#14b8a6", 460, "-8%", "6%") + orb("#a855f7", 460, "64%", "-14%") + orb("#ec4899", 380, "80%", "62%") + orb("#22d3ee", 300, "24%", "72%"),
    css: `
:root {
  --font: "Segoe UI", system-ui, sans-serif; --numFont: Consolas, monospace;
  --bg: linear-gradient(135deg, #0b0f22 0%, #131033 45%, #0a1626 100%);
  --text: #eef0ff; --muted: #9aa3cf; --accent: #22d3ee;
  --good: #2dd4bf; --amber: #fbbf24; --bad: #fb7185;
  --goodSoft: rgba(45,212,191,.16); --amberSoft: rgba(251,191,36,.16); --badSoft: rgba(251,113,133,.16);
  --cardBg: rgba(255,255,255,.07); --border: rgba(255,255,255,.16); --rowBorder: rgba(255,255,255,.07);
  --cardShadow: 0 8px 40px rgba(10,6,40,.5), inset 0 1px 0 rgba(255,255,255,.14), inset 0 0 40px rgba(168,85,247,.05);
  --blur: 22px; --radius: 20px; --orbOpacity: .7;
  --inputBg: rgba(255,255,255,.08); --rowBg: rgba(255,255,255,.055); --pillBg: rgba(255,255,255,.08);
  --btnBg: linear-gradient(90deg, #22d3ee, #a855f7); --btnText: #fff;
  --btnShadow: 0 6px 22px rgba(168,85,247,.4);
  --qrBg: rgba(255,255,255,.94); --qrInk: #14102e; --track: rgba(255,255,255,.1);
}
.logo em { background: linear-gradient(90deg, #22d3ee, #a855f7); -webkit-background-clip: text; background-clip: text; color: transparent; }
.orb { animation: drift 16s ease-in-out infinite alternate; }
@keyframes drift { from { transform: translate(0,0) scale(1); } to { transform: translate(50px,36px) scale(1.15); } }`,
  },
  {
    n: 3, name: "Porcelain", file: "preview-3.html",
    bgfx: orb("#bcd0ff", 440, "-6%", "-10%") + orb("#ffd9c8", 400, "70%", "-6%") + orb("#c9f2df", 360, "40%", "76%"),
    css: `
:root {
  --font: "Segoe UI", system-ui, sans-serif; --numFont: Consolas, monospace;
  --bg: linear-gradient(160deg, #f7f6f2 0%, #eef0f6 60%, #f4f0ea 100%);
  --text: #1f2430; --muted: #6d7690; --accent: #3b6ef6;
  --good: #0e9f6e; --amber: #d98a06; --bad: #e0344f;
  --goodSoft: rgba(14,159,110,.11); --amberSoft: rgba(217,138,6,.12); --badSoft: rgba(224,52,79,.1);
  --cardBg: rgba(255,255,255,.62); --border: rgba(255,255,255,.95); --rowBorder: rgba(31,36,48,.06);
  --cardShadow: 0 10px 34px rgba(41,50,80,.1), inset 0 1px 0 rgba(255,255,255,1);
  --blur: 20px; --radius: 18px; --orbOpacity: .8;
  --inputBg: rgba(255,255,255,.75); --rowBg: rgba(255,255,255,.55); --pillBg: rgba(255,255,255,.7);
  --btnBg: #3b6ef6; --btnText: #fff; --btnShadow: 0 6px 16px rgba(59,110,246,.3);
  --qrBg: #ffffff; --qrInk: #1f2430; --track: rgba(31,36,48,.08);
}`,
  },
  {
    n: 4, name: "Sunset Shield", file: "preview-4.html",
    bgfx: orb("#b45309", 430, "-6%", "-10%") + orb("#166534", 360, "74%", "70%") + orb("#dc2626", 300, "80%", "-10%") + orb("#eab308", 280, "30%", "76%"),
    css: `
:root {
  --font: "Segoe UI", system-ui, sans-serif; --numFont: Consolas, monospace;
  --bg: radial-gradient(130% 130% at 15% 0%, #1c1410 0%, #120d0a 55%, #0a0705 100%);
  --text: #f4ede2; --muted: #a89a85; --accent: #f5b942;
  --good: #35c26e; --amber: #f5b942; --bad: #f0545c;
  --goodSoft: rgba(53,194,110,.14); --amberSoft: rgba(245,185,66,.15); --badSoft: rgba(240,84,92,.14);
  --cardBg: rgba(255,214,150,.055); --border: rgba(255,214,150,.16); --rowBorder: rgba(255,214,150,.07);
  --cardShadow: 0 8px 32px rgba(10,5,0,.5), inset 0 1px 0 rgba(255,224,170,.1);
  --blur: 18px; --radius: 16px; --orbOpacity: .45;
  --inputBg: rgba(255,224,170,.06); --rowBg: rgba(255,224,170,.05); --pillBg: rgba(255,224,170,.07);
  --btnBg: linear-gradient(135deg, #f5b942, #e0812f); --btnText: #1c1006;
  --btnShadow: 0 6px 18px rgba(245,185,66,.3);
  --qrBg: rgba(255,250,240,.94); --qrInk: #1c1410; --track: rgba(255,224,170,.1);
}`,
  },
  {
    n: 5, name: "Ops Command", file: "preview-5.html",
    bgfx: "",
    css: `
:root {
  --font: Consolas, "Cascadia Mono", monospace; --numFont: Consolas, monospace;
  --bg: #050708; --text: #d6e2dc; --muted: #5f7268; --accent: #39ff8e;
  --good: #39ff8e; --amber: #ffc857; --bad: #ff4d5e;
  --goodSoft: rgba(57,255,142,.1); --amberSoft: rgba(255,200,87,.1); --badSoft: rgba(255,77,94,.12);
  --cardBg: #0a0e10; --border: #1d2a26; --rowBorder: #131b18;
  --cardShadow: 0 0 0 1px rgba(57,255,142,.04), 0 10px 30px rgba(0,0,0,.6);
  --blur: 0px; --radius: 8px;
  --inputBg: #0e1416; --rowBg: #0d1214; --pillBg: #0d1214;
  --btnBg: #123524; --btnText: #39ff8e; --btnShadow: inset 0 0 0 1px #1f5c3c;
  --qrBg: #d6e2dc; --qrInk: #050708; --track: #16201c;
  --kpiColor: #39ff8e;
}
.logo em { color: #39ff8e; text-shadow: 0 0 14px rgba(57,255,142,.55); }
.pill.ok { text-shadow: 0 0 8px rgba(57,255,142,.6); }
h2 { color: #3f8f68 !important; }
.feed { position: relative; }
.feed::after { content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: var(--radius);
  background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(57,255,142,.014) 3px 4px); }
.gaugeNum { text-shadow: 0 0 16px rgba(255,77,94,.6); }
.chip { border-radius: 4px; }
.decision { border: 1px solid var(--bad); background: transparent; }`,
  },
];

const TEMPLATE = (theme) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Theme ${theme.n} — ${theme.name}</title>
<style>${theme.css}\n${BASE_CSS}</style>
</head><body>${body(theme)}</body></html>`;

for (const t of THEMES) {
  fs.writeFileSync(path.join(__dirname, t.file), TEMPLATE(t));
  console.log("wrote", t.file);
}
