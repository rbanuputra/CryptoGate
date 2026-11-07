"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

interface Status {
  status: "running" | "paused" | "stopped";
  uptimeMs: number;
  activeCoins: string[];
}

interface SignalEvent {
  symbol: string;
  direction: string;
  strategy: string;
  entryPrice: number;
  reasoning: string;
}

const AGENT = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:4000";

export default function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [connected, setConnected] = useState(false);
  const [signals, setSignals] = useState<SignalEvent[]>([]);

  useEffect(() => {
    fetch(`${AGENT}/api/status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));

    const socket: Socket = io(AGENT, { transports: ["websocket"] });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("agent_status", (s: Status) => setStatus(s));
    socket.on("signal_generated", (sig: SignalEvent) =>
      setSignals((prev) => [sig, ...prev].slice(0, 20)),
    );
    return () => void socket.close();
  }, []);

  return (
    <main className="wrap">
      <h1 style={{ marginBottom: 4 }}>⚡ CryptoGate</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        <span className={`dot ${connected ? "running" : "idle"}`} />
        {connected ? "Agent connected" : "Agent offline"} · AI multi-strategy trading agent
      </p>

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="k">Agent Status</div>
          <div className="v">{status?.status ?? "—"}</div>
        </div>
        <div className="card">
          <div className="k">Active Coins</div>
          <div className="v">{status?.activeCoins?.length ?? 0}</div>
        </div>
        <div className="card">
          <div className="k">Uptime</div>
          <div className="v">{status ? Math.floor(status.uptimeMs / 1000) + "s" : "—"}</div>
        </div>
        <div className="card">
          <div className="k">Signals (session)</div>
          <div className="v">{signals.length}</div>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Recent Signals</h2>
      <div className="card">
        {signals.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            No signals yet. Start the agent with <code>LIVE=1</code> to connect the Binance feed.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {signals.map((s, i) => (
              <li key={i}>
                <strong>{s.symbol}</strong> {s.direction.toUpperCase()} via {s.strategy} @{" "}
                {s.entryPrice} — <span style={{ color: "var(--muted)" }}>{s.reasoning}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
