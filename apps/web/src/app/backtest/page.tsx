"use client";

import { useState } from "react";
import type { BacktestRequestDto, BacktestResultDto, BacktestStatsDto } from "@cryptogate/shared";
import { api } from "../../lib/api";
import { fmtUsd, fmtTime, cls } from "../../lib/format";
import { EquityChart } from "../../components/equity-chart";

const ALL_STRATEGIES = ["smc_sweep", "momentum_breakout", "mean_reversion", "oi_divergence", "vwap_bounce", "liquidation_fade"] as const;
// Need historical OI/funding/long-short data, which the backtest doesn't have.
const ORDERFLOW_ONLY = ["oi_divergence", "liquidation_fade"];

const DEFAULTS: BacktestRequestDto = {
  symbol: "BTCUSDT",
  chartTf: "15m",
  htfTf: "4h",
  startEquity: 10000,
  riskPct: 0.02,
  slippagePct: 0.0002,
  takerFeePct: 0.0006,
  minStopAtr: 1.5,
  strategies: "all",
  useRegimeSwitching: true,
  walkForward: false,
  days: 30,
};

export default function BacktestLab() {
  const [form, setForm] = useState<BacktestRequestDto>(DEFAULTS);
  const [result, setResult] = useState<BacktestResultDto | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof BacktestRequestDto>(k: K, v: BacktestRequestDto[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleStrategy(name: string) {
    setForm((f) => {
      const current = f.strategies === "all" ? [...ALL_STRATEGIES] : [...(f.strategies ?? [])];
      const idx = current.indexOf(name);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(name);
      return { ...f, strategies: current.length === ALL_STRATEGIES.length ? "all" : current };
    });
  }

  function isStratActive(name: string) {
    return form.strategies === "all" || (form.strategies ?? []).includes(name);
  }

  async function run() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await api.runBacktest(form);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setRunning(false);
    }
  }

  const s = result?.stats;

  return (
    <main className="wrap">
      <h1>Backtest Lab</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Run the price-based strategies (4 of 6) on historical data. oi divergence and liquidation fade need historical
        order-flow data and can only be validated in paper trading. Requires outbound API access.
      </p>

      <div className="card">
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <Field label="Symbol" type="text" value={form.symbol} onChange={(v) => set("symbol", v)} />
          <div>
            <div className="k">Chart TF</div>
            <select value={form.chartTf} onChange={(e) => set("chartTf", e.target.value)} style={{ width: "100%", marginTop: 4 }}>
              <option value="5m">5m</option><option value="15m">15m</option><option value="1h">1h</option>
            </select>
          </div>
          <div>
            <div className="k">HTF</div>
            <select value={form.htfTf} onChange={(e) => set("htfTf", e.target.value)} style={{ width: "100%", marginTop: 4 }}>
              <option value="1h">1h</option><option value="4h">4h</option><option value="1d">1d</option>
            </select>
          </div>
          <div>
            <div className="k">History</div>
            <select value={form.days ?? 30} onChange={(e) => set("days", Number(e.target.value))} style={{ width: "100%", marginTop: 4 }}>
              <option value={15}>15 days</option><option value={30}>30 days</option>
              <option value={60}>60 days</option><option value={90}>90 days</option>
              <option value={180}>180 days</option><option value={365}>365 days</option>
              <option value={0}>All (since listing, 15m+)</option>
            </select>
          </div>
          <Field label="Start Equity" type="number" value={form.startEquity} onChange={(v) => set("startEquity", Number(v))} />
          <Field label="Risk %" type="number" value={form.riskPct} step="0.005" onChange={(v) => set("riskPct", Number(v))} />
          <Field label="Slippage %" type="number" value={form.slippagePct} step="0.0001" onChange={(v) => set("slippagePct", Number(v))} />
          <Field label="Taker Fee %" type="number" value={form.takerFeePct} step="0.0001" onChange={(v) => set("takerFeePct", Number(v))} />
          <Field label="Min SL (× ATR, 0 = off)" type="number" value={form.minStopAtr ?? 0} step="0.1" onChange={(v) => set("minStopAtr", Number(v))} />
        </div>

        <h3 style={{ margin: "14px 0 6px", fontSize: 13 }}>Strategies</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ALL_STRATEGIES.map((name) => (
            <label
              key={name}
              title={ORDERFLOW_ONLY.includes(name) ? "Needs historical order-flow data — not available in backtest" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, opacity: ORDERFLOW_ONLY.includes(name) ? 0.5 : 1 }}
            >
              <input
                type="checkbox"
                checked={!ORDERFLOW_ONLY.includes(name) && isStratActive(name)}
                disabled={ORDERFLOW_ONLY.includes(name)}
                onChange={() => toggleStrategy(name)}
              />
              {name.replace(/_/g, " ")}{ORDERFLOW_ONLY.includes(name) ? " (n/a)" : ""}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={form.useRegimeSwitching !== false} onChange={(e) => set("useRegimeSwitching", e.target.checked)} />
            Regime switching
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={form.walkForward === true} onChange={(e) => set("walkForward", e.target.checked)} />
            Walk-forward (70/30 split)
          </label>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn primary" onClick={run} disabled={running}>{running ? "Running…" : "Run Backtest"}</button>
          {error && <span className="bad">{error}</span>}
        </div>
      </div>

      {s && result && (
        <>
          <h2>Results — {result.symbol} {result.chartTf}/{result.htfTf}</h2>
          {result.period && (
            <p className="muted" style={{ marginTop: -8 }}>
              {fmtTime(result.period.from)} → {fmtTime(result.period.to)} · {result.period.bars.toLocaleString()} bars
            </p>
          )}
          <div className="grid">
            <Stat k="Trades" v={`${s.totalTrades}`} />
            <Stat k="Win Rate" v={`${(s.winRate * 100).toFixed(1)}%`} />
            <Stat k="Profit Factor" v={s.profitFactor.toFixed(2)} c={s.profitFactor >= 1.5 ? "good" : s.profitFactor >= 1 ? "" : "bad"} />
            <Stat k="Return" v={`${s.totalReturnPct.toFixed(2)}%`} c={cls(s.totalReturnPct)} />
            <Stat k="Max DD" v={`${s.maxDrawdownPct.toFixed(2)}%`} c="bad" />
            <Stat k="Avg R" v={s.avgR.toFixed(3)} c={cls(s.avgR)} />
            <Stat k="Sharpe" v={(s.sharpeRatio ?? 0).toFixed(3)} c={cls(s.sharpeRatio ?? 0)} />
            <Stat k="Final Equity" v={fmtUsd(result.finalEquity)} c={cls(result.finalEquity - result.startEquity)} />
          </div>

          <h2>Equity Curve</h2>
          <div className="card">
            <EquityChart data={result.equityCurve.map((p) => ({ timestamp: p.time, equity: p.equity }))} startEquity={result.startEquity} />
          </div>

          {result.strategyBreakdown && Object.keys(result.strategyBreakdown).length > 0 && (
            <>
              <h2>Strategy Breakdown</h2>
              <div className="card">
                <table>
                  <thead><tr><th>Strategy</th><th>Trades</th><th>Win Rate</th><th>PF</th><th>PnL</th></tr></thead>
                  <tbody>
                    {Object.entries(result.strategyBreakdown).map(([name, d]) => (
                      <tr key={name}>
                        <td>{name.replace(/_/g, " ")}</td>
                        <td>{d.trades}</td>
                        <td>{(d.winRate * 100).toFixed(1)}%</td>
                        <td className={d.pf >= 1.5 ? "good" : d.pf >= 1 ? "" : "bad"}>{d.pf.toFixed(2)}</td>
                        <td className={cls(d.pnl)}>{fmtUsd(d.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result.walkForward && (
            <>
              <h2>Walk-Forward Validation (70% train / 30% test)</h2>
              <div className="grid">
                <WfCard label="TRAIN" stats={result.walkForward.train} />
                <WfCard label="TEST" stats={result.walkForward.test} />
              </div>
            </>
          )}

          <h2>Trade List ({result.trades.length}{result.trades.length > 300 ? ", last 300 shown" : ""})</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr><th>#</th><th>Entry</th><th>Exit</th><th>Dir</th><th>Strategy</th><th>Entry $</th><th>Exit $</th><th>Exit Type</th><th>PnL</th><th>R</th><th>Equity</th></tr>
              </thead>
              <tbody>
                {result.trades.slice(-300).map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td className="muted">{fmtTime(t.entryTime)}</td>
                    <td className="muted">{fmtTime(t.exitTime)}</td>
                    <td><span className={`badge ${t.direction}`}>{t.direction}</span></td>
                    <td className="muted">{t.entryType}</td>
                    <td>{t.entryPrice.toFixed(2)}</td>
                    <td>{t.exitPrice.toFixed(2)}</td>
                    <td>{t.exitType}</td>
                    <td className={cls(t.pnl)}>{fmtUsd(t.pnl)}</td>
                    <td className={cls(t.rMultiple)}>{t.rMultiple.toFixed(2)}R</td>
                    <td>{fmtUsd(t.equityAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

function Stat({ k, v, c }: { k: string; v: string; c?: string }) {
  return <div className="card"><div className="k">{k}</div><div className={`v ${c ?? ""}`}>{v}</div></div>;
}

function Field({ label, type, value, step, onChange }: { label: string; type: string; value: string | number; step?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="k">{label}</div>
      <input type={type} step={step} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
    </div>
  );
}

function WfCard({ label, stats }: { label: string; stats: BacktestStatsDto }) {
  return (
    <div className="card">
      <div className="k" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 3 }}>
        <span>Trades: {stats.totalTrades}</span>
        <span>WR: {(stats.winRate * 100).toFixed(1)}%</span>
        <span>PF: <span className={stats.profitFactor >= 1.5 ? "good" : stats.profitFactor >= 1 ? "" : "bad"}>{stats.profitFactor.toFixed(2)}</span></span>
        <span>Return: <span className={cls(stats.totalReturnPct)}>{stats.totalReturnPct.toFixed(2)}%</span></span>
        <span>Max DD: <span className="bad">{stats.maxDrawdownPct.toFixed(2)}%</span></span>
        <span>Sharpe: {(stats.sharpeRatio ?? 0).toFixed(3)}</span>
      </div>
    </div>
  );
}
