"use client";

import { useState } from "react";
import type { EquityPointDto, RegimeDto } from "@cryptogate/shared";
import { api } from "../../lib/api";
import { usePolling } from "../../lib/hooks";
import { EquityChart } from "../../components/equity-chart";
import { DrawdownChart } from "../../components/drawdown-chart";
import { RegimeTimeline, RegimeLegend } from "../../components/regime-timeline";

export default function Charts() {
  const { data: equity } = usePolling<EquityPointDto[]>(api.equity, 5000);
  const { data: regimes } = usePolling<RegimeDto[]>(api.regime, 5000);
  const [coin, setCoin] = useState<string>("all");

  const eqData = (equity ?? []).map((e) => ({ ...e, drawdownPct: -(e.drawdownPct * 100) }));
  const regData = regimes ?? [];
  const coins = [...new Set(regData.map((r) => r.symbol))];
  const filteredReg = coin === "all" ? regData : regData.filter((r) => r.symbol === coin);

  return (
    <main className="wrap">
      <h1>Charts</h1>

      <h2>Equity Curve</h2>
      <div className="card">
        <EquityChart data={eqData} />
      </div>

      <h2>Drawdown</h2>
      <div className="card">
        <DrawdownChart data={eqData} />
      </div>

      <h2>
        Regime Timeline{" "}
        <select value={coin} onChange={(e) => setCoin(e.target.value)} style={{ fontSize: 13, marginLeft: 8 }}>
          <option value="all">All coins</option>
          {coins.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </h2>
      <div className="card">
        <RegimeLegend />
        <div style={{ marginTop: 8 }}>
          <RegimeTimeline data={filteredReg} />
        </div>
      </div>
    </main>
  );
}
