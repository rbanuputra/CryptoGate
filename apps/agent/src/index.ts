/**
 * Agent bootstrap. Wires the vertical slice:
 *   DataFeed (15m + 4h) -> on each 15m close -> regime detect -> SMC scan -> log + push.
 *
 * Live data needs outbound access to fapi/fstream.binance.com. Where that is
 * blocked (or no API keys yet), run the backtest CLI instead:
 *   npm run backtest -w @cryptogate/agent -- --symbol BTCUSDT
 */
import {
  MarketRegime,
  type StrategyName,
  type Timeframe,
  type AgentStatusDto,
  type AgentConfigDto,
  type AgentControlAction,
  type AgentRunState,
  type PositionView,
  type StrategyStat,
  type ScreenerDto,
  type RegimeDto,
  type MomentumScore,
} from "@cryptogate/shared";
import { DataFeed } from "./data/feed.js";
import { calculateMomentumScore } from "./screener/momentum.js";
import { detectRegime } from "./regime/detector.js";
import { SmcSweepStrategy } from "./strategies/smc-strategy.js";
import { MomentumBreakoutStrategy } from "./strategies/momentum-breakout.js";
import { MeanReversionStrategy } from "./strategies/mean-reversion.js";
import { VwapBounceStrategy } from "./strategies/vwap-bounce.js";
import { OiDivergenceStrategy } from "./strategies/oi-divergence.js";
import { LiquidationFadeStrategy } from "./strategies/liquidation-fade.js";
import type { Strategy } from "./strategies/base.js";
import {
  OrderFlowStore,
  fetchOpenInterest,
  fetchFundingRate,
  fetchLongShortRatio,
} from "./data/orderflow.js";
import { InMemoryJournal } from "./monitoring/journal.js";
import {
  ConsoleNotifier,
  TelegramNotifier,
  MultiNotifier,
  templates,
  type Notifier,
} from "./monitoring/telegram.js";
import { TradeTracker } from "./execution/trade-tracker.js";
import { UserDataStream } from "./execution/user-stream.js";
import { aggregate, multiStrategyConfirm, type SignalHistoryEntry } from "./engine/aggregator.js";
import { RiskManager, RISK_DEFAULT } from "./risk/manager.js";
import { PositionManager } from "./execution/position-manager.js";
import { executeSignal } from "./execution/executor.js";
import {
  PaperExchangeClient,
  BinanceFuturesClient,
  type ExchangeClient,
} from "./execution/binance-client.js";
import { buildServer, type ServerDeps } from "./server/index.js";

const SYMBOLS = (process.env.SYMBOLS ?? "BTCUSDT,ETHUSDT,SOLUSDT").split(",");
const PORT = Number(process.env.AGENT_PORT ?? 4000);
const SIGNAL_TTL_MS = 30 * 60 * 1000;
const LEVERAGE = Number(process.env.LEVERAGE ?? 20);
const START_EQUITY = Number(process.env.START_EQUITY ?? 10_000);

function buildExchangeClient(): ExchangeClient {
  const key = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_API_SECRET;
  if (process.env.LIVE === "1" && key && secret) {
    console.log("[agent] using LIVE Binance client (testnet=" + (process.env.BINANCE_TESTNET !== "false") + ")");
    return new BinanceFuturesClient({ apiKey: key, apiSecret: secret, testnet: process.env.BINANCE_TESTNET !== "false" });
  }
  console.log("[agent] using PAPER exchange client (no live orders).");
  return new PaperExchangeClient();
}

function buildNotifier(): Notifier {
  const targets: Notifier[] = [new ConsoleNotifier()];
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    targets.push(new TelegramNotifier(token, chat));
    console.log("[agent] Telegram notifications enabled.");
  }
  return new MultiNotifier(targets);
}

async function main() {
  const startedAt = Date.now();
  let runState: AgentRunState = "running";
  const mode: "live" | "paper" = process.env.LIVE === "1" && process.env.BINANCE_API_KEY ? "live" : "paper";

  const timeframes: Timeframe[] = ["15m", "4h"];
  const feed = new DataFeed(SYMBOLS, timeframes);

  // Strategy registry — all 6 strategies implemented.
  const registry = new Map<StrategyName, Strategy>([
    ["smc_sweep", new SmcSweepStrategy()],
    ["momentum_breakout", new MomentumBreakoutStrategy()],
    ["mean_reversion", new MeanReversionStrategy()],
    ["vwap_bounce", new VwapBounceStrategy()],
    ["oi_divergence", new OiDivergenceStrategy()],
    ["liquidation_fade", new LiquidationFadeStrategy()],
  ]);

  // Order-flow stores (OI/funding/LS ratio), polled every 5 min in LIVE mode.
  const orderflow = new Map<string, OrderFlowStore>(SYMBOLS.map((s) => [s, new OrderFlowStore(s)]));
  async function pollOrderFlow(): Promise<void> {
    for (const symbol of SYMBOLS) {
      const store = orderflow.get(symbol)!;
      try {
        const [oi, funding, ls] = await Promise.all([
          fetchOpenInterest(symbol),
          fetchFundingRate(symbol),
          fetchLongShortRatio(symbol),
        ]);
        store.pushOi(oi, Date.now());
        store.pushFunding(funding);
        store.pushLsRatio(ls);
      } catch (e) {
        console.error(`[orderflow] ${symbol}:`, e instanceof Error ? e.message : e);
      }
    }
  }
  const history: SignalHistoryEntry[] = [];
  const risk = new RiskManager(RISK_DEFAULT, START_EQUITY);
  const positions = new PositionManager();
  const exchange = buildExchangeClient();
  const journal = new InMemoryJournal(); // swap for PrismaJournal(db) once Postgres is provisioned
  const notifier = buildNotifier();
  const tracker = new TradeTracker(START_EQUITY, positions, exchange, risk, journal, notifier);

  // ---- live in-memory view state for the dashboard ----------------------
  const config: AgentConfigDto = {
    leverage: LEVERAGE,
    riskPct: RISK_DEFAULT.riskPct,
    maxDailyLossPct: RISK_DEFAULT.circuit.maxDailyLossPct,
    maxConcurrentPositions: RISK_DEFAULT.maxConcurrentPositions,
    minRiskReward: RISK_DEFAULT.minRiskReward,
    symbols: SYMBOLS,
    strategiesEnabled: Object.fromEntries([...registry.keys()].map((k) => [k, true])) as Record<StrategyName, boolean>,
  };
  const regimePerCoin = new Map<string, RegimeDto>();
  const momentumByCoin = new Map<string, MomentumScore>();

  function strategyStats(): StrategyStat[] {
    return [...registry.keys()].map((strategy) => {
      const trades = journal.trades.filter((t) => t.strategy === strategy);
      const wins = trades.filter((t) => (t.pnlUsdt ?? 0) > 0);
      const gp = wins.reduce((s, t) => s + (t.pnlUsdt ?? 0), 0);
      const gl = -trades.filter((t) => (t.pnlUsdt ?? 0) < 0).reduce((s, t) => s + (t.pnlUsdt ?? 0), 0);
      return {
        strategy,
        trades: trades.length,
        winRate: trades.length ? Number((wins.length / trades.length).toFixed(4)) : 0,
        profitFactor: gl > 0 ? Number((gp / gl).toFixed(3)) : gp > 0 ? 999 : 0,
        avgR: trades.length ? Number((trades.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / trades.length).toFixed(3)) : 0,
        pnl: Number(trades.reduce((s, t) => s + (t.pnlUsdt ?? 0), 0).toFixed(2)),
        enabled: config.strategiesEnabled[strategy] ?? true,
      };
    });
  }
  function positionViews(): PositionView[] {
    return positions.list().filter((p) => p.status === "open").map((p) => ({
      symbol: p.symbol, direction: p.direction, strategy: p.signal.strategy,
      entryPrice: p.signal.entryPrice, quantity: p.size.quantity, notional: p.size.notional,
      slPrice: p.slPrice, tp1Price: p.signal.takeProfit1, tp2Price: p.signal.takeProfit2,
      tp1Hit: p.tp1Hit, openedAt: p.openedAt,
    }));
  }
  function statusDto(): AgentStatusDto {
    const snap = tracker.snapshot();
    return {
      status: runState, mode, uptimeMs: Date.now() - startedAt, activeCoins: config.symbols,
      equity: Number(snap.equity.toFixed(2)), peakEquity: Number(snap.peakEquity.toFixed(2)),
      openPositions: snap.openPositions,
    };
  }

  const deps: ServerDeps = {
    status: statusDto,
    trades: () => {
      const trades = journal.trades;
      const wins = trades.filter((t) => (t.pnlUsdt ?? 0) > 0);
      const gp = wins.reduce((s, t) => s + (t.pnlUsdt ?? 0), 0);
      const gl = -trades.filter((t) => (t.pnlUsdt ?? 0) < 0).reduce((s, t) => s + (t.pnlUsdt ?? 0), 0);
      return {
        trades: [...trades].reverse(),
        summary: {
          total: trades.length,
          winRate: trades.length ? Number((wins.length / trades.length).toFixed(4)) : 0,
          profitFactor: gl > 0 ? Number((gp / gl).toFixed(3)) : gp > 0 ? 999 : 0,
          avgR: trades.length ? Number((trades.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / trades.length).toFixed(3)) : 0,
          totalPnl: Number(trades.reduce((s, t) => s + (t.pnlUsdt ?? 0), 0).toFixed(2)),
        },
      };
    },
    signals: () => journal.signals.slice(-100).reverse().map((s) => ({ signal: s.signal, status: s.status, score: s.score, rejectReason: s.rejectReason })),
    equity: () => journal.equity.map((e) => ({ timestamp: e.timestamp, equity: e.equity, drawdownPct: e.drawdownPct, positionCount: e.positionCount })),
    positions: positionViews,
    regimes: () => [...regimePerCoin.values()],
    screener: (): ScreenerDto | null => {
      const list = [...momentumByCoin.values()].sort((a, b) => b.score - a.score);
      if (list.length === 0) return null;
      return {
        timestamp: Date.now(), watchlistSize: list.length, activeScanList: list.slice(0, 8),
        regimePerCoin: Object.fromEntries([...regimePerCoin.entries()].map(([k, v]) => [k, v.regime])),
      };
    },
    strategies: strategyStats,
    getConfig: () => config,
    setConfig: (patch) => {
      Object.assign(config, patch);
      if (patch.strategiesEnabled) config.strategiesEnabled = { ...config.strategiesEnabled, ...patch.strategiesEnabled };
      return config;
    },
    control: async (action: AgentControlAction) => {
      if (action === "start") runState = "running";
      else if (action === "pause") runState = "paused";
      else if (action === "stop") runState = "stopped";
      else if (action === "close_all") await positions.closeAll(exchange);
      return { ok: true, status: statusDto() };
    },
    closePosition: async (symbol: string) => {
      const pos = positions.get(symbol);
      if (!pos || pos.status !== "open") return { ok: false, reason: "no open position" };
      await exchange.createOrder({ symbol, side: pos.direction === "long" ? "SELL" : "BUY", type: "MARKET", quantity: pos.remainingQty, reduceOnly: true });
      pos.status = "closed";
      positions.remove(symbol);
      return { ok: true };
    },
  };
  const server = buildServer(deps);
  server.listen(PORT);

  feed.onCandleClose((symbol, tf, buf) => {
    if (tf !== "15m") return;
    const htfBuf = feed.buffer(symbol, "4h");
    if (!htfBuf) return;
    const regime = detectRegime([...htfBuf.all()], [...buf.all()]);
    server.emit("regime_update", { symbol, ...regime });
    regimePerCoin.set(symbol, { timestamp: regime.timestamp, symbol, regime: regime.regime, confidence: regime.confidence, adx: regime.adx });
    void journal.recordRegime({
      timestamp: regime.timestamp, symbol, regime: regime.regime, confidence: regime.confidence,
      adx: regime.adx, atrRatio: regime.volatilityLevel, bbWidth: buf.indicators?.bbWidth ?? 0,
      activeStrategies: [...registry.keys()],
    });

    // update screener momentum snapshot for this coin
    const ind = buf.indicators;
    const htfLast = htfBuf.last();
    if (ind && htfLast && ind.volumeSMA20 > 0 && ind.atrSMA100 > 0) {
      const of = orderflow.get(symbol)?.snapshot();
      momentumByCoin.set(symbol, calculateMomentumScore({
        symbol,
        priceChange4h: htfLast.open > 0 ? (htfLast.close - htfLast.open) / htfLast.open : 0,
        volumeRatio: (buf.last()?.volume ?? 0) / ind.volumeSMA20,
        atrRatio: ind.atr14 / ind.atrSMA100,
        oiChange4h: of && of.oi.length >= 2 ? (of.oi[of.oi.length - 1]! - of.oi[0]!) / (of.oi[0]! || 1) : 0,
        adx: regime.adx,
        bbWidth: ind.bbWidth,
      }));
    }

    // honor per-strategy toggles from the live config
    const activeRegistry = new Map([...registry].filter(([name]) => config.strategiesEnabled[name] !== false));
    const ranked = aggregate({
      symbol,
      chart: [...buf.all()],
      htf: [...htfBuf.all()],
      htfTf: "4h",
      regime,
      signalTtlMs: SIGNAL_TTL_MS,
      registry: activeRegistry,
      history,
      orderflow: orderflow.get(symbol)?.snapshot(),
      hasCorrelatedPosition: (sym, dir) => positions.openLike().some((p) => p.symbol !== sym && p.direction === dir),
    });
    if (history.length > 500) history.splice(0, history.length - 500);

    void handleTop(ranked[0]);

    async function handleTop(top: (typeof ranked)[number] | undefined) {
      if (!top) return;
      const sig = top.signal;
      history.push({ symbol: sig.symbol, direction: sig.direction, strategy: sig.strategy, timestamp: sig.timestamp });
      const multiConfirm = multiStrategyConfirm(sig, history, sig.timestamp);
      const decision = risk.evaluate(sig, {
        equity: tracker.equity,
        peakEquity: tracker.peakEquity,
        openPositions: positions.openLike(),
        multiConfirm,
        now: sig.timestamp,
      });
      const paused = runState !== "running";
      const approved = decision.approved && !paused;
      const reason = paused ? "agent " + runState : decision.reason;
      server.emit("signal_generated", { ...sig, score: top.score, approved, reason });
      void journal.recordSignal(sig, approved ? "taken" : "rejected", top.score, reason);
      console.log(`[signal] ${sig.symbol} ${sig.direction} ${sig.strategy} score=${top.score.toFixed(2)} ` +
        `-> ${approved ? "TAKE" : "REJECT: " + reason}`);
      if (!approved || !decision.positionSize) return;
      try {
        const pos = await executeSignal(exchange, sig, decision.positionSize, { leverage: LEVERAGE });
        positions.add(pos);
        risk.onOpen();
        server.emit("trade_opened", { symbol: pos.symbol, direction: pos.direction, size: pos.size, entry: sig.entryPrice });
        await notifier.send(templates.entry(sig, pos.size.quantity, pos.size.notional));
        console.log(`[exec] opened ${pos.symbol} ${pos.direction} qty=${pos.size.quantity}`);
      } catch (e) {
        console.error(`[exec] failed ${sig.symbol}:`, e instanceof Error ? e.message : e);
      }
    }
  });

  if (process.env.LIVE === "1") {
    console.log("[agent] bootstrapping historical data...");
    await feed.bootstrap();
    await pollOrderFlow();
    setInterval(() => void pollOrderFlow(), 5 * 60 * 1000);
    feed.connect();

    const key = process.env.BINANCE_API_KEY;
    if (key) {
      const userStream = new UserDataStream({ apiKey: key, testnet: process.env.BINANCE_TESTNET !== "false" });
      userStream.onEvent((ev) => {
        if (ev.type !== "fill") return;
        void tracker.processFill(ev).then(() => {
          server.emit("trade_updated", { symbol: ev.symbol, orderId: ev.orderId, status: ev.status });
          server.emit("equity_update", tracker.snapshot());
        });
      });
      await userStream.connect();
      console.log("[agent] user data stream connected (fill detection active).");
    }
    console.log("[agent] live feed connected.");
  } else {
    console.log("[agent] started in IDLE mode (set LIVE=1 to connect Binance feed).");
  }
}

main().catch((e) => {
  console.error("[agent] fatal:", e);
  process.exit(1);
});
