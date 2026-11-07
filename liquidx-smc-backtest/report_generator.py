"""
report_generator.py — build a single-page, self-contained dark-theme HTML
report with Chart.js (CDN) for the LiquidX SMC backtest.

Sections: cross-symbol leaderboard, per-symbol tabs (config head-to-head +
overlaid equity curves + best-config detail), aggregate view (config winner,
correlation matrix), and the optimization table.
"""

import json
from collections import defaultdict
from datetime import datetime, timezone


def _downsample(curve, max_points=600):
    if len(curve) <= max_points:
        return curve
    step = len(curve) // max_points
    return curve[::step]


def _fmt_pct(x):
    return f"{x:.1f}%"


def _pf_class(pf):
    if pf >= 1.5:
        return "good"
    if pf >= 1.0:
        return "ok"
    return "bad"


def generate(all_stats, tf_comparison, optimization, equity_curves, aggregate, out_dir):
    by_symbol = defaultdict(dict)
    for s in all_stats:
        by_symbol[s["symbol"]][s["config_name"]] = s
    symbols = list(by_symbol.keys())

    # ---- equity curve data per symbol (downsampled, as {config: [[ts,eq]...]})
    curve_data = {}
    for (sym, cfg), curve in equity_curves.items():
        ds = _downsample(curve)
        curve_data.setdefault(sym, {})[cfg] = [[c[0], c[1]] for c in ds]

    gen_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    html = []
    html.append(f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LiquidX SMC Backtest Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root{{--bg:#0d1117;--panel:#161b22;--panel2:#1c2330;--border:#30363d;--text:#e6edf3;
--muted:#8b949e;--good:#3fb950;--ok:#d29922;--bad:#f85149;--accent:#58a6ff;}}
*{{box-sizing:border-box;}}
body{{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}}
header{{padding:24px 20px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,#161b22,#0d1117);}}
h1{{margin:0;font-size:22px;}} h2{{font-size:17px;border-left:3px solid var(--accent);padding-left:10px;margin:28px 0 12px;}}
h3{{font-size:14px;color:var(--muted);margin:18px 0 8px;text-transform:uppercase;letter-spacing:.05em;}}
.sub{{color:var(--muted);font-size:13px;margin-top:4px;}}
.wrap{{max-width:1200px;margin:0 auto;padding:0 16px 60px;}}
table{{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:13px;}}
th,td{{padding:7px 9px;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap;}}
th:first-child,td:first-child{{text-align:left;}}
th{{color:var(--muted);font-weight:600;position:sticky;top:0;background:var(--panel);cursor:pointer;}}
tr:hover td{{background:var(--panel2);}}
.good{{color:var(--good);}} .ok{{color:var(--ok);}} .bad{{color:var(--bad);}}
.pill{{display:inline-block;padding:1px 8px;border-radius:10px;background:var(--panel2);border:1px solid var(--border);font-size:12px;}}
.tabs{{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0;}}
.tab{{padding:6px 14px;border:1px solid var(--border);border-radius:6px;background:var(--panel);cursor:pointer;color:var(--text);}}
.tab.active{{background:var(--accent);color:#0d1117;border-color:var(--accent);font-weight:600;}}
.panel{{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;}}
.sympage{{display:none;}} .sympage.active{{display:block;}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0;}}
.stat{{background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;}}
.stat .v{{font-size:20px;font-weight:700;}} .stat .k{{color:var(--muted);font-size:12px;}}
canvas{{max-height:340px;}}
.heat td{{font-variant-numeric:tabular-nums;}}
.foot{{color:var(--muted);font-size:12px;margin-top:40px;text-align:center;}}
@media (max-width:640px){{th,td{{padding:5px;font-size:12px;}}}}
</style></head><body>
<header><div class="wrap"><h1>⚡ LiquidX SMC Scalper — Backtest Report</h1>
<div class="sub">Liquidity Sweep → Displacement → OB/FVG Retest · Generated {gen_time}</div></div></header>
<div class="wrap">
""")

    # ---------------------------------------------------------------- aggregate banner
    best_cfg = aggregate["best_config_overall"]
    wins = aggregate["config_win_counts"]
    html.append('<h2>Aggregate Overview</h2><div class="panel"><div class="grid">')
    html.append(f'<div class="stat"><div class="v">{best_cfg}</div><div class="k">Best config (median PF)</div></div>')
    html.append(f'<div class="stat"><div class="v">{", ".join(aggregate["top3_symbols"])}</div><div class="k">Top-3 symbols</div></div>')
    wintxt = ", ".join(f"{k}:{v}" for k, v in sorted(wins.items(), key=lambda x: -x[1]))
    html.append(f'<div class="stat"><div class="v" style="font-size:14px">{wintxt}</div><div class="k">Config wins (symbols)</div></div>')
    html.append('</div></div>')

    # ---------------------------------------------------------------- leaderboard
    html.append('<h2>Cross-Symbol Leaderboard</h2><div class="panel"><table id="lb"><thead><tr>'
                '<th>Symbol</th><th>Best Config</th><th>PF</th><th>Win Rate</th>'
                '<th>Return</th><th>Max DD</th><th>Trades</th></tr></thead><tbody>')
    for r in aggregate["leaderboard"]:
        html.append(
            f'<tr><td>{r["symbol"]}</td><td><span class="pill">{r["best_config"]}</span></td>'
            f'<td class="{_pf_class(r["profit_factor"])}">{r["profit_factor"]:.2f}</td>'
            f'<td>{r["win_rate"]*100:.1f}%</td>'
            f'<td class="{"good" if r["total_return_pct"]>0 else "bad"}">{r["total_return_pct"]:.1f}%</td>'
            f'<td class="bad">{r["max_drawdown_pct"]:.1f}%</td>'
            f'<td>{r["total_trades"]}</td></tr>')
    html.append('</tbody></table></div>')

    # ---------------------------------------------------------------- per-symbol tabs
    html.append('<h2>Per-Symbol Detail</h2><div class="tabs">')
    for idx, sym in enumerate(symbols):
        active = "active" if idx == 0 else ""
        html.append(f'<div class="tab {active}" onclick="showSym(\'{sym}\')" id="tab-{sym}">{sym}</div>')
    html.append('</div>')

    for idx, sym in enumerate(symbols):
        active = "active" if idx == 0 else ""
        rows = by_symbol[sym]
        html.append(f'<div class="sympage {active}" id="page-{sym}"><div class="panel">')
        html.append(f'<h3>{sym} — config head-to-head</h3>')
        html.append('<table><thead><tr><th>Config</th><th>Trades</th><th>WR</th><th>PF</th>'
                    '<th>Return</th><th>Max DD</th><th>Avg R</th><th>Sharpe</th>'
                    '<th>OB PF</th><th>FVG PF</th></tr></thead><tbody>')
        best_row = None
        for cfg_name, s in rows.items():
            if best_row is None or s["profit_factor"] > best_row["profit_factor"]:
                best_row = s
            ob = s["setup_breakdown"].get("OB", {}).get("pf", 0)
            fvg = s["setup_breakdown"].get("FVG", {}).get("pf", 0)
            html.append(
                f'<tr><td>{cfg_name}</td><td>{s["total_trades"]}</td>'
                f'<td>{s["win_rate"]*100:.1f}%</td>'
                f'<td class="{_pf_class(s["profit_factor"])}">{s["profit_factor"]:.2f}</td>'
                f'<td class="{"good" if s["total_return_pct"]>0 else "bad"}">{s["total_return_pct"]:.1f}%</td>'
                f'<td class="bad">{s["max_drawdown_pct"]:.1f}%</td>'
                f'<td>{s["avg_rr"]:.2f}</td><td>{s["sharpe_ratio"]:.2f}</td>'
                f'<td>{ob:.2f}</td><td>{fvg:.2f}</td></tr>')
        html.append('</tbody></table>')
        html.append(f'<h3>Equity curves (all configs)</h3><canvas id="chart-{sym}"></canvas>')

        # best config detail
        if best_row:
            html.append(f'<h3>Best config: {best_row["config_name"]} — breakdown</h3>')
            html.append('<div class="grid">')
            for k, v in [("Return", f'{best_row["total_return_pct"]:.1f}%'),
                         ("Profit Factor", f'{best_row["profit_factor"]:.2f}'),
                         ("Win Rate", f'{best_row["win_rate"]*100:.1f}%'),
                         ("Sortino", f'{best_row["sortino_ratio"]:.2f}'),
                         ("Max DD", f'{best_row["max_drawdown_pct"]:.1f}%'),
                         ("Max Loss Streak", f'{best_row["max_consecutive_losses"]}')]:
                html.append(f'<div class="stat"><div class="v">{v}</div><div class="k">{k}</div></div>')
            html.append('</div>')
            # direction + exit + session mini tables
            html.append('<div style="display:flex;flex-wrap:wrap;gap:20px">')
            html.append(_mini_table("Direction", best_row["direction_breakdown"],
                                    ["trades", "wr", "pnl"]))
            html.append(_mini_table("Exits", best_row["exit_breakdown"], ["count", "pnl"]))
            html.append(_mini_table("Session", best_row["session_breakdown"],
                                    ["trades", "wr", "pnl"]))
            html.append('</div>')
        html.append('</div></div>')

    # ---------------------------------------------------------------- TF comparison
    if tf_comparison:
        html.append('<h2>Timeframe Comparison (best config, top-3 symbols)</h2><div class="panel">'
                    '<table><thead><tr><th>Symbol</th><th>TF Combo</th><th>Trades</th>'
                    '<th>WR</th><th>PF</th><th>Return</th><th>Max DD</th></tr></thead><tbody>')
        for s in tf_comparison:
            html.append(
                f'<tr><td>{s["symbol"]}</td><td>{s["timeframe"]}</td><td>{s["total_trades"]}</td>'
                f'<td>{s["win_rate"]*100:.1f}%</td>'
                f'<td class="{_pf_class(s["profit_factor"])}">{s["profit_factor"]:.2f}</td>'
                f'<td class="{"good" if s["total_return_pct"]>0 else "bad"}">{s["total_return_pct"]:.1f}%</td>'
                f'<td class="bad">{s["max_drawdown_pct"]:.1f}%</td></tr>')
        html.append('</tbody></table></div>')

    # ---------------------------------------------------------------- correlation
    corr = aggregate.get("monthly_correlation", {})
    if corr:
        syms = list(corr.keys())
        html.append('<h2>Monthly PnL Correlation (best config)</h2><div class="panel">'
                    '<div class="sub">Do symbols win/lose together? 1 = perfectly correlated.</div>'
                    '<table class="heat"><thead><tr><th></th>')
        for s in syms:
            html.append(f'<th>{s.replace("USDT","")}</th>')
        html.append('</tr></thead><tbody>')
        for r in syms:
            html.append(f'<tr><td>{r.replace("USDT","")}</td>')
            for cc in syms:
                v = corr[r].get(cc, 0)
                hue = 120 if v >= 0 else 0
                light = 20 + abs(v) * 25
                html.append(f'<td style="background:hsl({hue},50%,{light}%)">{v:.2f}</td>')
            html.append('</tr>')
        html.append('</tbody></table></div>')

    # ---------------------------------------------------------------- optimization
    if optimization:
        html.append('<h2>Optimization — Top 5 Param Combos per Symbol (min 30 trades)</h2>')
        for sym, combos in optimization.items():
            html.append(f'<div class="panel"><h3>{sym}</h3>')
            if not combos:
                html.append('<div class="sub">No combos reached 30+ trades.</div></div>')
                continue
            html.append('<table><thead><tr><th>#</th><th>disp_mult</th><th>tp2_rr</th>'
                        '<th>cooldown</th><th>choch</th><th>PF</th><th>WR</th>'
                        '<th>Return</th><th>Trades</th></tr></thead><tbody>')
            for i, r in enumerate(combos, 1):
                p = r["params"]
                html.append(
                    f'<tr><td>{i}</td><td>{p["displacement_mult"]}</td><td>{p["tp2_rr"]}</td>'
                    f'<td>{p["cooldown_bars"]}</td><td>{p["choch_required"]}</td>'
                    f'<td class="{_pf_class(r["profit_factor"])}">{r["profit_factor"]:.2f}</td>'
                    f'<td>{r["win_rate"]*100:.1f}%</td>'
                    f'<td class="{"good" if r["total_return_pct"]>0 else "bad"}">{r["total_return_pct"]:.1f}%</td>'
                    f'<td>{r["trades"]}</td></tr>')
            html.append('</tbody></table></div>')

    html.append(f'<div class="foot">LiquidX SMC Scalper backtest · $10k start · 2% risk · '
                f'fees 0.06%/side · funding 0.01%/8h · no look-ahead (next-bar-open fills)</div>')

    # ---------------------------------------------------------------- scripts
    palette = ["#58a6ff", "#3fb950", "#d29922", "#f85149", "#bc8cff", "#39c5cf"]
    html.append('</div><script>')
    html.append(f'const CURVES={json.dumps(curve_data)};')
    html.append(f'const PALETTE={json.dumps(palette)};')
    html.append('''
const charts={};
function buildChart(sym){
  if(charts[sym])return;
  const el=document.getElementById('chart-'+sym);
  if(!el||!CURVES[sym])return;
  const cfgs=Object.keys(CURVES[sym]);
  const ds=cfgs.map((c,i)=>{
    const pts=CURVES[sym][c].map(p=>({x:p[0],y:p[1]}));
    return {label:c,data:pts,borderColor:PALETTE[i%PALETTE.length],
      borderWidth:1.4,pointRadius:0,tension:0.05,fill:false};
  });
  charts[sym]=new Chart(el,{type:'line',data:{datasets:ds},
    options:{responsive:true,animation:false,parsing:true,
      interaction:{mode:'index',intersect:false},
      scales:{x:{type:'linear',ticks:{color:'#8b949e',
        callback:v=>new Date(v).toISOString().slice(0,7)},grid:{color:'#21262d'}},
        y:{ticks:{color:'#8b949e'},grid:{color:'#21262d'}}},
      plugins:{legend:{labels:{color:'#e6edf3'}},
        tooltip:{callbacks:{title:items=>new Date(items[0].parsed.x).toISOString().slice(0,10)}}}}});
}
function showSym(sym){
  document.querySelectorAll('.sympage').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+sym).classList.add('active');
  document.getElementById('tab-'+sym).classList.add('active');
  buildChart(sym);
}
// sortable leaderboard
document.querySelectorAll('#lb th').forEach((th,i)=>th.onclick=()=>{
  const tb=th.closest('table').querySelector('tbody');
  const rows=[...tb.rows];
  const num=i>1;
  rows.sort((a,b)=>{const x=a.cells[i].innerText.replace(/[%]/g,''),y=b.cells[i].innerText.replace(/[%]/g,'');
    return num?parseFloat(y)-parseFloat(x):x.localeCompare(y);});
  rows.forEach(r=>tb.appendChild(r));
});
''')
    first = symbols[0] if symbols else None
    if first:
        html.append(f"buildChart('{first}');")
    html.append('</script></body></html>')

    with open(f"{out_dir}/report.html", "w") as f:
        f.write("".join(html))


def _mini_table(title, data, cols):
    h = [f'<div><h3>{title}</h3><table style="min-width:220px"><thead><tr><th>{title}</th>']
    for c in cols:
        h.append(f'<th>{c}</th>')
    h.append('</tr></thead><tbody>')
    for k, v in data.items():
        h.append(f'<tr><td>{k}</td>')
        for c in cols:
            val = v.get(c, 0)
            if c == "wr":
                h.append(f'<td>{val*100:.0f}%</td>')
            elif c == "pnl":
                cls = "good" if val > 0 else "bad"
                h.append(f'<td class="{cls}">{val:.0f}</td>')
            else:
                h.append(f'<td>{val}</td>')
        h.append('</tr>')
    h.append('</tbody></table></div>')
    return "".join(h)
