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
  BacktestRequestDto,
  BacktestResultDto,
  EquityPointDto,
  PositionView,
  RegimeDto,
  ScreenerDto,
  SignalRecordDto,
  StrategyStat,
  TradesResponse,
  Timeframe,
} from "@cryptogate/shared";
import { backtestSmc, BACKTEST_DEFAULT } from "../backtest/runner.js";
import { fetchKlines, loadCsv } from "../backtest/data-loader.js";

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
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (_req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  const apiSecret = process.env.API_SECRET;
  if (apiSecret) {
    app.use("/api", (req, res, next) => {
      if (req.path === "/health") return next();
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token !== apiSecret) return res.status(401).json({ error: "unauthorized" });
      next();
    });
    console.log("[server] API_SECRET set — agent API is protected.");
  }

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

  app.post("/api/backtest/run", async (req, res) => {
    try {
      const body = req.body as Partial<BacktestRequestDto>;
      const symbol = body.symbol ?? "BTCUSDT";
      const chartTf = (body.chartTf ?? "15m") as Timeframe;
      const htfTf = (body.htfTf ?? "4h") as Timeframe;
      const startEquity = body.startEquity ?? BACKTEST_DEFAULT.startEquity;

      const chart = await fetchKlines(symbol, chartTf, { limit: 1500 });
      const htf = await fetchKlines(symbol, htfTf, { limit: 1000 });

      const cfg = {
        ...BACKTEST_DEFAULT,
        startEquity,
        riskPct: body.riskPct ?? BACKTEST_DEFAULT.riskPct,
        slippagePct: body.slippagePct ?? BACKTEST_DEFAULT.slippagePct,
        takerFeePct: body.takerFeePct ?? BACKTEST_DEFAULT.takerFeePct,
      };
      const result = backtestSmc(chart, htf, htfTf, cfg);

      const equityCurve = result.trades.map((t) => ({ time: t.exitTime, equity: t.equityAfter }));
      equityCurve.unshift({ time: chart[0]?.openTime ?? 0, equity: startEquity });

      const dto: BacktestResultDto = {
        symbol, chartTf, htfTf,
        trades: result.trades,
        equityCurve,
        stats: result.stats,
        startEquity: result.startEquity,
        finalEquity: result.finalEquity,
      };
      res.json(dto);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "backtest failed" });
    }
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
