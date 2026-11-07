"use client";

import type { ScreenerDto } from "@cryptogate/shared";
import { api } from "../../lib/api";
import { usePolling } from "../../lib/hooks";

export default function Screener() {
  const { data } = usePolling<ScreenerDto | null>(api.screener, 10000);

  return (
    <main className="wrap">
      <h1>Coin Screener</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Watchlist: {data?.watchlistSize ?? 0} · Active scan list ranked by momentum score
      </p>
      <div className="card">
        {!data || data.activeScanList.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No screener data yet — the agent populates this once candles stream in (LIVE mode).</p>
        ) : (
          <table>
            <thead><tr><th>#</th><th>Symbol</th><th>Score</th><th>Chg 4H</th><th>Vol Spike</th><th>ATR Exp</th><th>OI Chg</th><th>Regime</th></tr></thead>
            <tbody>
              {data.activeScanList.map((c, i) => (
                <tr key={c.symbol}>
                  <td>{i + 1}</td>
                  <td>{c.symbol}</td>
                  <td style={{ color: `hsl(${Math.round(c.score * 120)},60%,55%)` }}>{c.score.toFixed(2)}</td>
                  <td>{(c.priceChange4h * 100).toFixed(1)}%</td>
                  <td>{c.volumeSpike.toFixed(1)}x</td>
                  <td>{c.atrExpansion.toFixed(1)}x</td>
                  <td>{(c.oiChange4h * 100).toFixed(1)}%</td>
                  <td className={`reg-${data.regimePerCoin[c.symbol] ?? "low_vol"}`}>{data.regimePerCoin[c.symbol] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
