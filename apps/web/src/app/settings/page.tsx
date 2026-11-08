"use client";

import { useEffect, useState } from "react";
import type { AgentConfigDto, AgentStatusDto, ExchangeName, StrategyName } from "@cryptogate/shared";
import { api } from "../../lib/api";

export default function Settings() {
  const [cfg, setCfg] = useState<AgentConfigDto | null>(null);
  const [status, setStatus] = useState<AgentStatusDto | null>(null);
  const [saved, setSaved] = useState("");

  async function refresh() {
    setStatus(await api.status().catch(() => null));
    setCfg(await api.config().catch(() => null));
  }
  useEffect(() => { void refresh(); }, []);

  async function control(action: "start" | "pause" | "stop" | "close_all") {
    await api.control(action);
    void refresh();
  }
  async function save() {
    if (!cfg) return;
    await api.putConfig(cfg);
    setSaved("Saved ✓");
    setTimeout(() => setSaved(""), 2000);
  }
  function toggleStrategy(name: StrategyName) {
    if (!cfg) return;
    setCfg({ ...cfg, strategiesEnabled: { ...cfg.strategiesEnabled, [name]: !cfg.strategiesEnabled[name] } });
  }
  function num(key: keyof AgentConfigDto, value: string) {
    if (!cfg) return;
    setCfg({ ...cfg, [key]: Number(value) });
  }

  return (
    <main className="wrap">
      <h1>Agent Settings</h1>

      <h2>Agent Control</h2>
      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className={`dot ${status?.status === "running" ? "running" : status ? "idle" : "stopped"}`} />
        <span className="muted">{status ? `${status.status} · ${status.mode}` : "offline"}</span>
        <span style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => control("start")}>Start</button>
        <button className="btn" onClick={() => control("pause")}>Pause</button>
        <button className="btn" onClick={() => control("stop")}>Stop</button>
        <button className="btn danger" onClick={() => control("close_all")}>Emergency Close All</button>
      </div>

      {cfg && (
        <>
          <h2>Exchange</h2>
          <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="k" style={{ margin: 0 }}>Active Exchange</span>
            <select
              value={cfg.exchange}
              onChange={(e) => setCfg({ ...cfg, exchange: e.target.value as ExchangeName })}
              style={{ flex: 1, maxWidth: 200 }}
            >
              <option value="binance">Binance Futures</option>
              <option value="bitget">Bitget Futures</option>
            </select>
            <span className="muted" style={{ fontSize: 11 }}>
              Requires restart &amp; matching API keys in .env
            </span>
          </div>

          <h2>Risk Parameters</h2>
          <div className="card grid">
            <Field label="Leverage" value={cfg.leverage} onChange={(v) => num("leverage", v)} />
            <Field label="Risk per trade" value={cfg.riskPct} step="0.01" onChange={(v) => num("riskPct", v)} />
            <Field label="Max daily loss" value={cfg.maxDailyLossPct} step="0.01" onChange={(v) => num("maxDailyLossPct", v)} />
            <Field label="Max positions" value={cfg.maxConcurrentPositions} onChange={(v) => num("maxConcurrentPositions", v)} />
            <Field label="Min R:R" value={cfg.minRiskReward} step="0.1" onChange={(v) => num("minRiskReward", v)} />
            <Field label="Min SL distance (× ATR)" value={cfg.minStopAtr ?? 0} step="0.1" onChange={(v) => num("minStopAtr", v)} />
          </div>
          <p className="muted" style={{ fontSize: 11, margin: "6px 0 0" }}>
            Min SL distance: a stop tighter than this many ATRs is widened to it (TPs keep their R multiples, size shrinks
            accordingly). Adapts to volatility instead of a fixed %. 0 = off. Applied to new signals right after Save.
          </p>

          <h2>Strategy Toggles</h2>
          <div className="card">
            {(Object.keys(cfg.strategiesEnabled) as StrategyName[]).map((name) => (
              <label key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <input type="checkbox" checked={cfg.strategiesEnabled[name]} onChange={() => toggleStrategy(name)} />
                {name}
              </label>
            ))}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn primary" onClick={save}>Save</button>
            <button className="btn" onClick={refresh}>Reset</button>
            <span className="good">{saved}</span>
          </div>
        </>
      )}
    </main>
  );
}

function Field({ label, value, step, onChange }: { label: string; value: number; step?: string; onChange: (v: string) => void }) {
  return (
    <div className="card">
      <div className="k">{label}</div>
      <input type="number" step={step ?? "1"} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
    </div>
  );
}
