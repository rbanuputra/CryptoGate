"use client";

import { useState } from "react";
import type { AgentStatusDto, PositionView, TradesResponse } from "@cryptogate/shared";
import { api } from "../lib/api";
import { usePolling, useSocketEvent } from "../lib/hooks";
import { fmtUsd, fmtTime, cls } from "../lib/format";

export default function Overview() {
  const { data: status } = usePolling<AgentStatusDto>(api.status, 3000);
  const { data: positions } = usePolling<PositionView[]>(api.positions, 3000);
  const { data: trades } = usePolling<TradesResponse>(api.trades, 5000);
  const [live, setLive] = useState(false);
  useSocketEvent("agent_status", () => setLive(true));

  const recent = trades?.trades.slice(0, 10) ?? [];
  const s = trades?.summary;

  return (
    <main className="wrap">
      <h1>Dashboard</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        <span className={`dot ${status?.status === "running" ? "running" : status ? "idle" : "stopped"}`} />
        {status ? `${status.status} · ${status.mode}` : "agent offline"} {live ? "· socket live" : ""}
      </p>

      <div className="grid">
        <Stat k="Equity" v={status ? fmtUsd(status.equity) : "—"} />
        <Stat k="Peak Equity" v={status ? fmtUsd(status.peakEquity) : "—"} />
        <Stat k="Win Rate" v={s ? `${(s.winRate * 100).toFixed(1)}%` : "—"} sub={s ? `${s.total} trades` : ""} />
        <Stat k="Profit Factor" v={s ? s.profitFactor.toFixed(2) : "—"} />
        <Stat k="Total PnL" v={s ? fmtUsd(s.totalPnl) : "—"} cls={cls(s?.totalPnl ?? 0)} />
        <Stat k="Open Positions" v={status ? `${status.openPositions}/${status.activeCoins.length}` : "—"} />
      </div>

      <h2>Open Positions</h2>
      <div className="card">
        {positions && positions.length > 0 ? (
          <table>
            <thead><tr><th>Symbol</th><th>Dir</th><th>Strategy</th><th>Entry</th><th>SL</th><th>TP1</th><th>TP2</th><th>Qty</th><th></th></tr></thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.symbol}>
                  <td>{p.symbol}</td>
                  <td><span className={`badge ${p.direction}`}>{p.direction}</span></td>
                  <td className="muted">{p.strategy}</td>
                  <td>{p.entryPrice}</td><td>{p.slPrice}</td><td>{p.tp1Price}</td><td>{p.tp2Price}</td><td>{p.quantity}</td>
                  <td><button className="btn danger" onClick={() => api.closePosition(p.symbol)}>Close</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted" style={{ margin: 0 }}>No open positions.</p>}
      </div>

      <h2>Recent Trades</h2>
      <div className="card">
        {recent.length > 0 ? (
          <table>
            <thead><tr><th>Exit</th><th>Symbol</th><th>Dir</th><th>Strategy</th><th>Type</th><th>PnL</th><th>R</th></tr></thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{t.exitTime ? fmtTime(t.exitTime) : "—"}</td>
                  <td>{t.symbol}</td>
                  <td><span className={`badge ${t.direction}`}>{t.direction}</span></td>
                  <td className="muted">{t.strategy}</td>
                  <td>{t.exitType}</td>
                  <td className={cls(t.pnlUsdt ?? 0)}>{fmtUsd(t.pnlUsdt ?? 0)}</td>
                  <td className={cls(t.rMultiple ?? 0)}>{(t.rMultiple ?? 0).toFixed(2)}R</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted" style={{ margin: 0 }}>No trades yet. Run the agent with <code>LIVE=1</code>.</p>}
      </div>
    </main>
  );
}

function Stat({ k, v, sub, cls: c }: { k: string; v: string; sub?: string; cls?: string }) {
  return (
    <div className="card">
      <div className="k">{k}</div>
      <div className={`v ${c ?? ""}`}>{v}</div>
      {sub ? <div className="muted" style={{ fontSize: 12 }}>{sub}</div> : null}
    </div>
  );
}
