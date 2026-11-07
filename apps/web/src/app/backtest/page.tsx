"use client";

import { useState } from "react";
import type { BacktestRequestDto, BacktestResultDto } from "@cryptogate/shared";
import { api } from "../../lib/api";
import { fmtUsd, fmtTime, cls } from "../../lib/format";
import { EquityChart } from "../../components/equity-chart";

const DEFAULTS: BacktestRequestDto = {
  symbol: "BTCUSDT",
  chartTf: "15m",
  htfTf: "4h",
  startEquity: 10000,
  riskPct: 0.02,
  slippagePct: 0.0002,
  takerFeePct: 0.0006,
};

export default function BacktestLab() {
  const [form, setForm] = useState<BacktestRequestDto>(DEFAULTS);
  const [result, setResult] = useState<BacktestResultDto | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof BacktestRequestDto>(k: K, v: BacktestRequestDto[K]) {
    setForm((f) => ({ ...f, [k]: v }));
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
      <p className="muted" style={{ marginTop: 0 }}>Run the SMC Sweep strategy on historical data from Binance. Requires outbound API access.</p>

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
          <Field label="Start Equity" type="number" value={form.startEquity} onChange={(v) => set("startEquity", Number(v))} />
          <Field label="Risk %" type="number" value={form.riskPct} step="0.005" onChange={(v) => set("riskPct", Number(v))} />
          <Field label="Slippage %" type="number" value={form.slippagePct} step="0.0001" onChange={(v) => set("slippagePct", Number(v))} />
          <Field label="Taker Fee %" type="number" value={form.takerFeePct} step="0.0001" onChange={(v) => set("takerFeePct", Number(v))} />
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn primary" onClick={run} disabled={running}>{running ? "Running…" : "Run Backtest"}</button>
          {error && <span className="bad">{error}</span>}
        </div>
      </div>

      {s && result && (
        <>
          <h2>Results — {result.symbol} {result.chartTf}/{result.htfTf}</h2>
          <div className="grid">
            <Stat k="Trades" v={`${s.totalTrades}`} />
            <Stat k="Win Rate" v={`${(s.winRate * 100).toFixed(1)}%`} />
            <Stat k="Profit Factor" v={s.profitFactor.toFixed(2)} c={s.profitFactor >= 1.5 ? "good" : s.profitFactor >= 1 ? "" : "bad"} />
            <Stat k="Return" v={`${s.totalReturnPct.toFixed(2)}%`} c={cls(s.totalReturnPct)} />
            <Stat k="Max DD" v={`${s.maxDrawdownPct.toFixed(2)}%`} c="bad" />
            <Stat k="Avg R" v={s.avgR.toFixed(3)} c={cls(s.avgR)} />
            <Stat k="Final Equity" v={fmtUsd(result.finalEquity)} c={cls(result.finalEquity - result.startEquity)} />
          </div>

          <h2>Equity Curve</h2>
          <div className="card">
            <EquityChart
              data={result.equityCurve.map((p) => ({ timestamp: p.time, equity: p.equity }))}
              startEquity={result.startEquity}
            />
          </div>

          <h2>Trade List ({result.trades.length})</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr><th>#</th><th>Entry</th><th>Exit</th><th>Dir</th><th>Type</th><th>Entry $</th><th>Exit $</th><th>Exit Type</th><th>PnL</th><th>R</th><th>Equity</th></tr>
              </thead>
              <tbody>
                {result.trades.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td className="muted">{fmtTime(t.entryTime)}</td>
                    <td className="muted">{fmtTime(t.exitTime)}</td>
                    <td><span className={`badge ${t.direction}`}>{t.direction}</span></td>
                    <td>{t.entryType}</td>
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
