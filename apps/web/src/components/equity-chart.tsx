"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";

interface Point {
  timestamp: number;
  equity: number;
  drawdownPct?: number;
}

const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function EquityChart({ data, startEquity }: { data: Point[]; startEquity?: number }) {
  if (data.length === 0) return <p className="muted">No equity data yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#58a6ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
        <XAxis dataKey="timestamp" tickFormatter={fmt} tick={{ fill: "#8b949e", fontSize: 11 }} stroke="#30363d" />
        <YAxis domain={["auto", "auto"]} tick={{ fill: "#8b949e", fontSize: 11 }} stroke="#30363d" tickFormatter={(v: number) => `$${v.toLocaleString()}`} />
        <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, fontSize: 12, color: "#e6edf3" }}
          labelFormatter={fmt} formatter={(v: number) => [`$${v.toFixed(2)}`, "Equity"]} />
        {startEquity != null && <ReferenceLine y={startEquity} stroke="#8b949e" strokeDasharray="4 4" label={{ value: "Start", fill: "#8b949e", fontSize: 11 }} />}
        <Area type="monotone" dataKey="equity" stroke="#58a6ff" fillOpacity={1} fill="url(#eqGrad)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
