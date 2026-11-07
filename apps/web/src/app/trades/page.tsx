"use client";

import { useMemo, useState } from "react";
import type { TradesResponse } from "@cryptogate/shared";
import { api } from "../../lib/api";
import { usePolling } from "../../lib/hooks";
import { fmtUsd, fmtTime, cls } from "../../lib/format";

export default function Trades() {
  const { data } = usePolling<TradesResponse>(api.trades, 5000);
  const [dir, setDir] = useState<"all" | "long" | "short">("all");
  const [result, setResult] = useState<"all" | "win" | "loss">("all");

  const rows = useMemo(() => {
    let t = data?.trades ?? [];
    if (dir !== "all") t = t.filter((x) => x.direction === dir);
    if (result !== "all") t = t.filter((x) => (result === "win" ? (x.pnlUsdt ?? 0) > 0 : (x.pnlUsdt ?? 0) <= 0));
    return t;
  }, [data, dir, result]);

  const s = data?.summary;

  return (
    <main className="wrap">
      <h1>Trade Journal</h1>
      <div className="grid" style={{ marginTop: 10 }}>
        <Stat k="Trades" v={`${s?.total ?? 0}`} />
        <Stat k="Win Rate" v={s ? `${(s.winRate * 100).toFixed(1)}%` : "—"} />
        <Stat k="Profit Factor" v={s ? s.profitFactor.toFixed(2) : "—"} />
        <Stat k="Avg R" v={s ? s.avgR.toFixed(2) : "—"} />
        <Stat k="Total PnL" v={s ? fmtUsd(s.totalPnl) : "—"} c={cls(s?.totalPnl ?? 0)} />
      </div>

      <div style={{ display: "flex", gap: 6, margin: "12px 0" }}>
        <select value={dir} onChange={(e) => setDir(e.target.value as typeof dir)}>
          <option value="all">All directions</option><option value="long">Long</option><option value="short">Short</option>
        </select>
        <select value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
          <option value="all">All results</option><option value="win">Winners</option><option value="loss">Losers</option>
        </select>
      </div>

      <div className="card">
        {rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>No trades match.</p> : (
          <table>
            <thead><tr><th>Entry</th><th>Exit</th><th>Symbol</th><th>Dir</th><th>Strategy</th><th>Regime</th><th>Type</th><th>Entry $</th><th>Exit $</th><th>PnL</th><th>R</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{fmtTime(t.entryTime)}</td>
                  <td className="muted">{t.exitTime ? fmtTime(t.exitTime) : "—"}</td>
                  <td>{t.symbol}</td>
                  <td><span className={`badge ${t.direction}`}>{t.direction}</span></td>
                  <td className="muted">{t.strategy}</td>
                  <td className={`reg-${t.regime}`}>{t.regime}</td>
                  <td>{t.exitType}</td>
                  <td>{t.entryPrice}</td><td>{t.exitPrice ?? "—"}</td>
                  <td className={cls(t.pnlUsdt ?? 0)}>{fmtUsd(t.pnlUsdt ?? 0)}</td>
                  <td className={cls(t.rMultiple ?? 0)}>{(t.rMultiple ?? 0).toFixed(2)}R</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function Stat({ k, v, c }: { k: string; v: string; c?: string }) {
  return <div className="card"><div className="k">{k}</div><div className={`v ${c ?? ""}`}>{v}</div></div>;
}
