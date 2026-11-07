"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import type { RegimeDto } from "@cryptogate/shared";

const REGIME_COLOR: Record<string, string> = {
  trending_up: "#3fb950",
  trending_down: "#f85149",
  ranging: "#58a6ff",
  high_vol: "#d29922",
  low_vol: "#8b949e",
};

const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function RegimeTimeline({ data }: { data: RegimeDto[] }) {
  if (data.length === 0) return <p className="muted">No regime data yet.</p>;

  const rows = data.map((d) => ({ ...d, bar: 1 }));

  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={rows} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <XAxis dataKey="timestamp" tickFormatter={fmt} tick={{ fill: "#8b949e", fontSize: 10 }} stroke="#30363d" />
        <YAxis hide domain={[0, 1]} />
        <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, fontSize: 12, color: "#e6edf3" }}
          labelFormatter={fmt}
          formatter={(_v: unknown, _n: unknown, props: { payload?: Partial<RegimeDto & { bar: number }> }) => {
            const p = props.payload;
            if (!p) return ["—", "Regime"];
            return [`${p.regime ?? "?"} (ADX ${(p.adx ?? 0).toFixed(1)}, conf ${((p.confidence ?? 0) * 100).toFixed(0)}%)`, "Regime"];
          }} />
        <Bar dataKey="bar" radius={[3, 3, 0, 0]}>
          {rows.map((r, i) => <Cell key={i} fill={REGIME_COLOR[r.regime] ?? "#8b949e"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RegimeLegend() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11 }}>
      {Object.entries(REGIME_COLOR).map(([k, c]) => (
        <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: "inline-block" }} />
          {k.replace("_", " ")}
        </span>
      ))}
    </div>
  );
}
