"use client";

import { useEffect, useState } from "react";
import type { SignalRecordDto, Signal } from "@cryptogate/shared";
import { api } from "../../lib/api";
import { useSocketEvent } from "../../lib/hooks";
import { fmtTime } from "../../lib/format";

type Live = Signal & { score: number; approved: boolean; reason?: string };

export default function Signals() {
  const [items, setItems] = useState<SignalRecordDto[]>([]);
  const [filter, setFilter] = useState<"all" | "taken" | "rejected">("all");

  useEffect(() => { api.signals().then(setItems).catch(() => {}); }, []);
  useSocketEvent<Live>("signal_generated", (s) => {
    const rec: SignalRecordDto = { signal: s, status: s.approved ? "taken" : "rejected", score: s.score, rejectReason: s.reason };
    setItems((prev) => [rec, ...prev].slice(0, 200));
  });

  const shown = items.filter((i) => filter === "all" || i.status === filter);

  return (
    <main className="wrap">
      <h1>Signal Log</h1>
      <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
        {(["all", "taken", "rejected"] as const).map((f) => (
          <button key={f} className={`btn ${filter === f ? "primary" : ""}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      <div className="card">
        {shown.length === 0 ? <p className="muted" style={{ margin: 0 }}>No signals yet.</p> : (
          <table>
            <thead><tr><th>Time</th><th>Symbol</th><th>Dir</th><th>Strategy</th><th>Score</th><th>R:R</th><th>Status</th><th>Reason</th></tr></thead>
            <tbody>
              {shown.map((i, idx) => (
                <tr key={i.signal.id + idx}>
                  <td className="muted">{fmtTime(i.signal.timestamp)}</td>
                  <td>{i.signal.symbol}</td>
                  <td><span className={`badge ${i.signal.direction}`}>{i.signal.direction}</span></td>
                  <td className="muted">{i.signal.strategy}</td>
                  <td>{i.score.toFixed(2)}</td>
                  <td>{i.signal.riskReward.toFixed(1)}</td>
                  <td><span className={`badge ${i.status}`}>{i.status === "taken" ? "✅ taken" : "❌ rejected"}</span></td>
                  <td className="muted" style={{ textAlign: "left", maxWidth: 320, whiteSpace: "normal" }}>{i.rejectReason ?? i.signal.reasoning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
