"use client";

import type { StrategyStat } from "@cryptogate/shared";
import { api } from "../../lib/api";
import { usePolling } from "../../lib/hooks";
import { fmtUsd, cls, pfClass } from "../../lib/format";

export default function Strategies() {
  const { data } = usePolling<StrategyStat[]>(api.strategies, 5000);
  const rows = data ?? [];

  return (
    <main className="wrap">
      <h1>Strategy Monitor</h1>
      <div className="card">
        <table>
          <thead><tr><th>Strategy</th><th>Trades</th><th>Win Rate</th><th>Profit Factor</th><th>Avg R</th><th>PnL</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.strategy}>
                <td>{s.strategy}</td>
                <td>{s.trades}</td>
                <td>{(s.winRate * 100).toFixed(1)}%</td>
                <td className={pfClass(s.profitFactor)}>{s.profitFactor.toFixed(2)}</td>
                <td className={cls(s.avgR)}>{s.avgR.toFixed(2)}</td>
                <td className={cls(s.pnl)}>{fmtUsd(s.pnl)}</td>
                <td><span className={`badge ${s.enabled ? "taken" : "rejected"}`}>{s.enabled ? "active" : "off"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Toggle strategies on the Settings page. Stats are computed from the live journal.</p>
    </main>
  );
}
