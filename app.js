(() => {
  "use strict";
  const POLL_MS = 60000;
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const usd = (n, d = 2) => (n == null || isNaN(n)) ? "—" : (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, {minimumFractionDigits: d, maximumFractionDigits: d});
  const pct = (n) => (n == null || isNaN(n)) ? "—" : (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  const cls = (n) => n > 0 ? "pos" : n < 0 ? "neg" : "";
  const px = (n) => n == null ? "—" : "$" + Number(n).toPrecision(4);
  const t = (ts) => ts ? new Date(ts * 1000).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"}) : "—";
  const ago = (ts) => { if (!ts) return "—"; const s = Date.now() / 1000 - ts; return s < 60 ? Math.round(s) + "s ago" : s < 3600 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago"; };
  const FOMO = "https://fomo.family/coin?address=";
  const fomoBtn = (u) => (typeof u === "string" && u.startsWith(FOMO)) ? `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener noreferrer">Open on FOMO</a>` : "";

  // data path: #d=... -> localStorage, then strip from the address bar
  const m = location.hash.match(/[#&]d=([A-Za-z0-9]{32,})/);
  if (m) { localStorage.setItem("desk_dp", m[1]); history.replaceState(null, "", location.pathname); }
  const DP = localStorage.getItem("desk_dp");
  const base = DP ? `d/${DP}/` : null;

  let tab = "home", data = {state: null, activity: null, chart: null}, err = null, sub = null; // sub = {kind:'audits'|'coin', mint}

  async function get(path) {
    const r = await fetch(base + path + "?t=" + Date.now(), {cache: "no-store"});
    if (!r.ok) throw new Error(r.status === 404 ? "No data yet (first push may still be building)" : "HTTP " + r.status);
    return r.json();
  }
  async function poll() {
    if (!base) { render(); return; }
    try {
      const [s, a, c] = await Promise.all([get("state.json"), get("activity.json"), get("chart.json")]);
      data = {state: s, activity: a, chart: c}; err = null;
    } catch (e) { err = e.message || String(e); }
    render();
  }

  function setTab(name) { tab = name; sub = null; document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name)); render(); window.scrollTo(0, 0); }
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

  function render() {
    const titles = {home: "Home", bots: "Bots", activity: "Activity", account: "Account"};
    $("#title").textContent = sub ? (sub.kind === "coin" ? "Coin" : "Audits") : titles[tab];
    const s = data.state;
    $("#updated").textContent = s ? `last update ${t(s.generated_at)} (${ago(s.generated_at)}) · checks every 60 s` + (err ? " · offline: " + err : "") : (err ? "" : "Loading…");
    const v = $("#view");
    if (!base && tab !== "account") { v.innerHTML = `<div class="state"><p>No desk linked on this device.</p><p class="note">Open the private link you were given (it ends in <span class="mono">#d=…</span>) once, and this device remembers it.</p></div>`; return; }
    if (!s && err && tab !== "account") { v.innerHTML = `<div class="state error"><p>Couldn't load the desk.</p><p class="note">${esc(err)}</p><button class="btn alt" id="retry">Retry</button></div>`; $("#retry").onclick = poll; return; }
    if (!s && tab !== "account") { v.innerHTML = `<div class="state loading"><div class="spin"></div><p>Loading desk…</p></div>`; return; }
    if (sub && sub.kind === "audits") return renderAudits(v, s);
    if (sub && sub.kind === "coin") return renderCoin(v);
    ({home: renderHome, bots: renderBots, activity: renderActivity, account: renderAccount})[tab](v, s);
  }

  function renderHome(v, s) {
    const pos = s.positions || [], w = s.watching || [];
    v.innerHTML = `
      <div class="card"><div class="dim">Paper equity</div><div class="big">${usd(s.equity)}</div>
        <div class="${cls(s.pnl_usd)}">${usd(s.pnl_usd)} (${pct(s.pnl_pct)}) since start ${usd(s.start_usd, 0)}</div>
        <div class="note">Cash ${usd(s.cash)} · realized ${usd(s.realized_usd)} ${s.paused ? '· <span class="pill o">paused</span>' : ""}</div>
        <canvas id="chart"></canvas></div>
      <div class="h">Open positions</div>
      <div class="card">${pos.length ? pos.map(p => `<div class="row" data-mint="${esc(p.mint)}"><div class="l"><b>${esc(p.symbol)}</b><small>in ${px(p.entry)} · now ${px(p.price)} · ${ago(p.opened)}${p.tp_done ? " · TP1 taken" : ""}</small></div><div class="r"><b class="${cls(p.pnl_pct)}">${pct(p.pnl_pct)}</b><br><small class="dim">${usd(p.value)}</small></div></div>`).join("") : `<div class="dim">No open paper positions.</div>`}</div>
      <div class="h">Waiting for a dip</div>
      <div class="card">${w.length ? w.map(x => `<div class="row" data-mint="${esc(x.mint)}"><div class="l"><b>${esc(x.symbol)}</b><small>score ${Math.round(x.score)} · buy at ≤ ${px(x.trigger)}</small></div><div class="r dim">${ago(x.since)}</div></div>`).join("") : `<div class="dim">Nothing approved right now.</div>`}</div>
      <div class="h">Recent closes</div>
      <div class="card">${(s.closed || []).length ? s.closed.slice(0, 10).map(c => `<div class="row" data-mint="${esc(c.mint)}"><div class="l"><b>${esc(c.symbol)}</b><small>${esc(c.exit_reason)}</small></div><div class="r ${cls(c.pnl_usd)}">${usd(c.pnl_usd)}</div></div>`).join("") : `<div class="dim">No closed trades yet.</div>`}</div>
      <button class="btn alt" id="audits">Audits (${(s.audits || []).length})</button>`;
    drawChart();
    bindCoins(v);
    $("#audits").onclick = () => { sub = {kind: "audits"}; render(); };
  }

  function drawChart() {
    const c = $("#chart"); if (!c) return;
    const pts = (data.chart && data.chart.points) || [];
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d"); g.scale(dpr, dpr);
    if (pts.length < 2) { g.fillStyle = "#8e8e93"; g.font = "13px -apple-system,sans-serif"; g.fillText("Chart fills in as the desk runs", 8, H / 2); return; }
    const ys = pts.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), span = (hi - lo) || 1;
    const x0 = pts[0][0], xs = (pts[pts.length - 1][0] - x0) || 1;
    const up = ys[ys.length - 1] >= (data.chart.start_usd || ys[0]);
    g.strokeStyle = up ? "#30d158" : "#ff453a"; g.lineWidth = 2; g.beginPath();
    pts.forEach((p, i) => { const x = (p[0] - x0) / xs * (W - 4) + 2, y = H - 8 - (p[1] - lo) / span * (H - 16); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    g.fillStyle = "#8e8e93"; g.font = "11px -apple-system,sans-serif"; g.fillText(usd(hi), 4, 12); g.fillText(usd(lo), 4, H - 2);
  }

  function renderBots(v, s) {
    const icon = (st) => st === "running" || st === "idle" || st === "auditing" ? "g" : st === "paused" ? "o" : "r";
    v.innerHTML = (s.bots || []).map(b => `
      <div class="card"><div class="row"><div class="l"><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div><div class="r"><span class="pill ${icon(b.status)}">${esc(b.status)}</span></div></div>
        <div class="grid">${Object.entries(b.counts || {}).map(([k, n]) => `<div><small class="dim">${esc(k.replace("_", " "))}</small><b>${esc(n)}</b></div>`).join("")}</div>
        <div class="note">${b.last ? esc(b.last) + " · " + ago(b.last_ts) : "No action yet."}</div>
        <div class="note">Live screen: not in this build</div></div>`).join("") +
      `<div class="card"><div class="dim">Feeds</div><div class="note">PumpPortal: ${esc(s.feeds.pumpportal)} · DexScreener calls ${esc(s.feeds.dex_calls)} · RugCheck ${esc(s.feeds.rug_calls)} · RPC ${esc(s.feeds.rpc_calls)} (429s: ${esc(s.feeds.rpc_429)})</div></div>`;
  }

  function renderActivity(v) {
    const items = (data.activity && data.activity.items) || [];
    v.innerHTML = items.length ? `<div class="card">${items.map(a => `<div class="row" ${a.mint ? `data-mint="${esc(a.mint)}"` : ""}><div class="l"><b>${esc(a.text)}</b><small>${esc(a.bot)} · ${t(a.ts)}</small></div></div>`).join("")}</div>` : `<div class="state"><p>No activity yet.</p><p class="note">The Scanner logs each pump.fun migration here.</p></div>`;
    bindCoins(v);
  }

  function renderAccount(v, s) {
    const rows = s ? Object.entries(s.settings || {}).map(([k, o]) => `<div class="row"><div class="l"><b>${esc(k)}</b><small>${esc(o.help)}${o.min != null ? ` (${esc(o.min)}–${esc(o.max)})` : ""}</small></div><div class="r">${esc(o.value)}</div></div>`).join("") : "";
    v.innerHTML = `
      <div class="card"><div class="row"><div class="l"><b>Mode</b><small>${s ? esc(s.live_note) : "LIVE not available in this build"}</small></div><div class="r"><span class="pill o">PAPER</span></div></div>
        ${s ? `<div class="row"><div class="l"><b>FOMO handle</b></div><div class="r">@${esc(s.fomo_handle)}</div></div>` : ""}
        ${s && typeof s.profile_url === "string" && s.profile_url.startsWith("https://fomo.family/profile/") ? `<a class="btn alt" href="${esc(s.profile_url)}" target="_blank" rel="noopener noreferrer">Your FOMO profile</a>` : ""}
        <div class="row"><div class="l"><b>This device</b><small>${base ? "Linked to your desk" : "Not linked"}</small></div><div class="r"><button class="back" id="unlink">${base ? "Unlink" : ""}</button></div></div></div>
      <div class="h">Settings</div>
      <div class="card"><div class="note">${s ? esc(s.settings_note) : "Change via Telegram"}</div>${rows}</div>
      <div class="card"><div class="note">Data on GitHub Pages is public to anyone who has the private link. Updates land at most every ${s ? esc(s.push.interval_min) : 10} minutes.</div></div>`;
    const u = $("#unlink"); if (u && base) u.onclick = () => { localStorage.removeItem("desk_dp"); location.reload(); };
  }

  function renderAudits(v, s) {
    const a = s.audits || [];
    v.innerHTML = `<button class="back" id="bk">‹ Back</button><div class="card">${a.length ? a.map(x => `<div class="row" data-mint="${esc(x.mint)}"><div class="l"><b>${esc(x.symbol || x.mint.slice(0, 6))}</b><small>${esc(x.kill_reason || x.verdict)} · ${t(x.ts)}</small></div><div class="r"><span class="pill ${x.verdict === "approved" ? "g" : x.verdict === "killed" ? "r" : ""}">${x.score != null ? Math.round(x.score) : "—"}</span></div></div>`).join("") : `<div class="dim">No audits yet.</div>`}</div>`;
    $("#bk").onclick = () => { sub = null; render(); };
    bindCoins(v);
  }

  async function renderCoin(v) {
    v.innerHTML = `<div class="state loading"><div class="spin"></div><p>Loading coin…</p></div>`;
    let c;
    try { c = await get("coin/" + encodeURIComponent(sub.mint) + ".json"); }
    catch (e) { v.innerHTML = `<button class="back" id="bk">‹ Back</button><div class="state"><p>No audit for this coin in the latest push.</p><p class="note">${esc(e.message)}</p></div>`; $("#bk").onclick = () => { sub = null; render(); }; return; }
    if (!sub || sub.kind !== "coin") return;
    const L = c.layers || {}, P = c.points || {};
    const layerRow = (k, label) => { const l = L[k] || {}, p = P[k] || {}; const val = typeof l.value === "number" ? l.value : 0; return `<div class="row"><div class="l"><b>${esc(label)}</b><small>${esc(l.note || l.label || "")}</small><div class="bar"><i style="width:${Math.round(val * 100)}%"></i></div></div><div class="r">${p.w ? `${esc(p.points)}/${esc(p.w)}` : (k === "authority" ? (val ? "ok" : "fail") : "w=0")}</div></div>`; };
    v.innerHTML = `<button class="back" id="bk">‹ Back</button>
      <div class="card"><div class="row"><div class="l"><b style="font-size:22px">${esc(c.symbol)}</b><small>${esc(c.name)}</small></div><div class="r"><span class="pill ${c.verdict === "approved" ? "g" : c.verdict === "killed" ? "r" : ""}">${esc(c.verdict)}</span></div></div>
        <div class="grid"><div><small class="dim">score</small><b>${esc(Math.round(c.score))}</b></div><div><small class="dim">price</small><b>${px(c.price_usd)}</b></div><div><small class="dim">liquidity</small><b>${usd(c.liquidity_usd, 0)}</b></div><div><small class="dim">market cap</small><b>${usd(c.market_cap, 0)}</b></div></div>
        ${c.kills && c.kills.length ? `<div class="note neg">Killed: ${c.kills.map(esc).join("; ")}</div>` : ""}
        ${fomoBtn(c.coin_url)}</div>
      <div class="h">Audit · 8 layers</div>
      <div class="card">${layerRow("authority", "1 · Mint / freeze authority")}${layerRow("liquidity", "2 · Liquidity")}${layerRow("dev", "3 · Dev history")}${layerRow("top10", "4 · Top 10 holders")}${layerRow("insiders", "5 · Insiders")}${layerRow("organic", "6 · Organic (txns)")}${layerRow("flush", "7 · Flush (txns)")}${layerRow("delegations", "8 · Delegations")}${layerRow("social", "Social")}${layerRow("smart", "Smart money")}
        ${c.penalty ? `<div class="note">RugCheck danger flags: −${esc(c.penalty)}</div>` : ""}</div>
      <div class="card"><div class="note">FOMO-only fields (unique buyers/sellers, FOMO holders, tokenWarnings, selling off) are not public and stay empty. Organic and flush use DexScreener trade counts.</div>
        <div class="note">Audited ${t(c.audited_at)} · RugCheck holders ${esc(c.rugcheck_holders ?? "—")}</div><div class="note mono">${esc(c.mint)}</div></div>`;
    $("#bk").onclick = () => { sub = null; render(); };
  }

  function bindCoins(v) {
    v.querySelectorAll("[data-mint]").forEach(el => el.addEventListener("click", () => { sub = {kind: "coin", mint: el.dataset.mint}; render(); window.scrollTo(0, 0); }));
  }

  window.addEventListener("resize", () => { if (tab === "home" && !sub) drawChart(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  poll();
  setInterval(poll, POLL_MS);
})();
