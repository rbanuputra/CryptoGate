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
import { backtestMulti, walkForwardSplit, MULTI_BT_DEFAULT, type MultiBacktestConfig } from "../backtest/multi-runner.js";
import { fetchKlines, loadCsv } from "../backtest/data-loader.js";
import { TF_MS } from "@cryptogate/shared";
import { verifySocketToken } from "./socket-token.js";

/** Clamp the SL-floor input to 0 (off) .. 10 ATR; fall back when missing/invalid. */
export function sanitizeMinStopAtr(v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 10) : fallback;
}

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
      const startEquity = body.startEquity ?? MULTI_BT_DEFAULT.startEquity;
      const strategies = body.strategies ?? "all";
      const useRegime = body.useRegimeSwitching !== false;
      const doWalkForward = body.walkForward === true;

      const exchange = deps.getConfig().exchange;
      const rawDays = body.days === undefined ? 30 : Number(body.days);
      const allHistory = rawDays === 0;
      if (allHistory && TF_MS[chartTf] < TF_MS["15m"]) {
        return res.status(400).json({ error: "Since-listing history needs Chart TF 15m or higher" });
      }
      const days = Math.min(Math.max(rawDays || 30, 5), 365);
      const FLOOR = Date.UTC(2019, 0, 1);
      const chartOpts = allHistory ? { startMs: FLOOR } : { limit: Math.ceil((days * 86_400_000) / TF_MS[chartTf]) + 200 };
      const htfOpts = allHistory ? { startMs: FLOOR } : { limit: Math.ceil((days * 86_400_000) / TF_MS[htfTf]) + 250 };
      const chart = await fetchKlines(symbol, chartTf, chartOpts, exchange);
      const htf = await fetchKlines(symbol, htfTf, htfOpts, exchange);

      const multiCfg = {
        ...MULTI_BT_DEFAULT,
        startEquity,
        riskPct: body.riskPct ?? MULTI_BT_DEFAULT.riskPct,
        slippagePct: body.slippagePct ?? MULTI_BT_DEFAULT.slippagePct,
        takerFeePct: body.takerFeePct ?? MULTI_BT_DEFAULT.takerFeePct,
        minStopAtr: sanitizeMinStopAtr(body.minStopAtr, MULTI_BT_DEFAULT.minStopAtr),
        strategies: strategies as MultiBacktestConfig["strategies"],
        useRegimeSwitching: useRegime,
        htfTf,
      };

      const result = backtestMulti(chart, htf, multiCfg);

      let wf: { train: typeof result.stats; test: typeof result.stats } | undefined;
      if (doWalkForward) {
        const split = walkForwardSplit(chart, htf, 0.7, TF_MS[htfTf]);
        const trainRes = backtestMulti(split.train.chart, split.train.htf, multiCfg);
        const testRes = backtestMulti(split.test.chart, split.test.htf, multiCfg);
        wf = { train: trainRes.stats, test: testRes.stats };
      }

      const dto: BacktestResultDto = {
        symbol, chartTf, htfTf,
        trades: result.trades.map((t) => ({
          id: t.id, direction: t.direction, entryType: t.strategy,
          entryTime: t.entryTime, exitTime: t.exitTime,
          entryPrice: t.entryPrice, exitPrice: t.exitPrice,
          exitType: t.exitType, pnl: t.pnl, rMultiple: t.rMultiple, equityAfter: t.equityAfter,
        })),
        equityCurve: result.equityCurve,
        stats: { ...result.stats, sharpeRatio: result.stats.sharpeRatio } as BacktestResultDto["stats"],
        startEquity: result.startEquity,
        finalEquity: result.finalEquity,
        strategyBreakdown: result.strategyBreakdown,
        regimeLog: result.regimeLog,
        skippedStrategies: result.skippedStrategies,
        walkForward: wf,
        period: chart.length ? { from: chart[0]!.openTime, to: chart[chart.length - 1]!.openTime, bars: chart.length } : undefined,
      };
      res.json(dto);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "backtest failed" });
    }
  });

  const http = createServer(app);
  const io = new IOServer(http, { cors: { origin: "*" } });
  if (apiSecret) {
    io.use((socket, next) =>
      verifySocketToken(socket.handshake.auth?.token, apiSecret) ? next() : next(new Error("unauthorized")),
    );
  }
  io.on("connection", (socket) => socket.emit("agent_status", deps.status()));

  return {
    app,
    http,
    io,
    emit: (event, payload) => io.emit(event, payload),
    listen: (port: number) => http.listen(port, () => console.log(`[server] API+WS on :${port}`)),
  };
}
