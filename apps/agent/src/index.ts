/**
 * Agent bootstrap. Wires the vertical slice:
 *   DataFeed (15m + 4h) -> on each 15m close -> regime detect -> SMC scan -> log + push.
 *
 * Live data needs outbound access to fapi/fstream.binance.com. Where that is
 * blocked (or no API keys yet), run the backtest CLI instead:
 *   npm run backtest -w @cryptogate/agent -- --symbol BTCUSDT
 */
import type { StrategyName, Timeframe } from "@cryptogate/shared";
import { DataFeed } from "./data/feed.js";
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
import { buildServer, type AgentStatus } from "./server/index.js";

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
  const status: AgentStatus = {
    status: "running",
    uptimeMs: 0,
    activeCoins: SYMBOLS,
    startedAt,
  };
  const server = buildServer(() => ({ ...status, uptimeMs: Date.now() - startedAt }));
  server.listen(PORT);

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

  feed.onCandleClose((symbol, tf, buf) => {
    if (tf !== "15m") return;
    const htfBuf = feed.buffer(symbol, "4h");
    if (!htfBuf) return;
    const regime = detectRegime([...htfBuf.all()], [...buf.all()]);
    server.emit("regime_update", { symbol, ...regime });
    void journal.recordRegime({
      timestamp: regime.timestamp, symbol, regime: regime.regime, confidence: regime.confidence,
      adx: regime.adx, atrRatio: regime.volatilityLevel, bbWidth: 0,
      activeStrategies: [...registry.keys()],
    });

    const ranked = aggregate({
      symbol,
      chart: [...buf.all()],
      htf: [...htfBuf.all()],
      htfTf: "4h",
      regime,
      signalTtlMs: SIGNAL_TTL_MS,
      registry,
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
      server.emit("signal_generated", { ...sig, score: top.score, approved: decision.approved, reason: decision.reason });
      void journal.recordSignal(sig, decision.approved ? "taken" : "rejected", top.score, decision.reason);
      console.log(`[signal] ${sig.symbol} ${sig.direction} ${sig.strategy} score=${top.score.toFixed(2)} ` +
        `-> ${decision.approved ? "TAKE" : "REJECT: " + decision.reason}`);
      if (!decision.approved || !decision.positionSize) return;
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
