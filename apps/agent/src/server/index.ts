/**
 * API + WebSocket server. REST endpoints back the dashboard; Socket.io pushes
 * real-time events. All data comes from the injected `ServerDeps` (the agent's
 * live in-memory state), keeping the server a thin transport layer.
 */
import { createServer, type Server as HttpServer } from "node:http";
import express, { type Express } from "express";
import { Server as IOServer } from "socket.io";
import type {
  AgentConfigDto,
  AgentControlAction,
  AgentStatusDto,
  EquityPointDto,
  PositionView,
  RegimeDto,
  ScreenerDto,
  SignalRecordDto,
  StrategyStat,
  TradesResponse,
} from "@cryptogate/shared";

export interface ServerDeps {
  status(): AgentStatusDto;
  trades(): TradesResponse;
  signals(): SignalRecordDto[];
  equity(): EquityPointDto[];
  positions(): PositionView[];
  regimes(): RegimeDto[];
  screener(): ScreenerDto | null;
  strategies(): StrategyStat[];
  getConfig(): AgentConfigDto;
  setConfig(patch: Partial<AgentConfigDto>): AgentConfigDto;
  control(action: AgentControlAction): Promise<{ ok: boolean; status: AgentStatusDto }>;
  closePosition(symbol: string): Promise<{ ok: boolean; reason?: string }>;
}

export interface ServerHandle {
  app: Express;
  http: HttpServer;
  io: IOServer;
  emit: (event: string, payload: unknown) => void;
  listen: (port: number) => void;
}

export function buildServer(deps: ServerDeps): ServerHandle {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.get("/api/status", (_req, res) => res.json(deps.status()));
  app.get("/api/trades", (_req, res) => res.json(deps.trades()));
  app.get("/api/signals", (_req, res) => res.json(deps.signals()));
  app.get("/api/equity", (_req, res) => res.json(deps.equity()));
  app.get("/api/positions", (_req, res) => res.json(deps.positions()));
  app.get("/api/regime", (_req, res) => res.json(deps.regimes()));
  app.get("/api/screener", (_req, res) => res.json(deps.screener()));
  app.get("/api/strategies", (_req, res) => res.json(deps.strategies()));
  app.get("/api/config", (_req, res) => res.json(deps.getConfig()));

  app.put("/api/config", (req, res) => res.json(deps.setConfig(req.body ?? {})));

  app.post("/api/agent/:action", async (req, res) => {
    const action = req.params.action as AgentControlAction;
    if (!["start", "pause", "stop", "close_all"].includes(action)) {
      return res.status(400).json({ ok: false, reason: "unknown action" });
    }
    res.json(await deps.control(action));
  });

  app.post("/api/position/:symbol/close", async (req, res) => {
    res.json(await deps.closePosition(req.params.symbol));
  });

  const http = createServer(app);
  const io = new IOServer(http, { cors: { origin: "*" } });
  io.on("connection", (socket) => socket.emit("agent_status", deps.status()));

  return {
    app,
    http,
    io,
    emit: (event, payload) => io.emit(event, payload),
    listen: (port: number) => http.listen(port, () => console.log(`[server] API+WS on :${port}`)),
  };
}
