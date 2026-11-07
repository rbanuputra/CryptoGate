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
import type { Strategy } from "./strategies/base.js";
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

  // Strategy registry. Strategies 4 (OI divergence) & 6 (liquidation fade) land next.
  const registry = new Map<StrategyName, Strategy>([
    ["smc_sweep", new SmcSweepStrategy()],
    ["momentum_breakout", new MomentumBreakoutStrategy()],
    ["mean_reversion", new MeanReversionStrategy()],
    ["vwap_bounce", new VwapBounceStrategy()],
  ]);
  const history: SignalHistoryEntry[] = [];
  const risk = new RiskManager(RISK_DEFAULT, START_EQUITY);
  const positions = new PositionManager();
  const exchange = buildExchangeClient();
  let equity = START_EQUITY;
  let peakEquity = START_EQUITY;

  feed.onCandleClose((symbol, tf, buf) => {
    if (tf !== "15m") return;
    const htfBuf = feed.buffer(symbol, "4h");
    if (!htfBuf) return;
    const regime = detectRegime([...htfBuf.all()], [...buf.all()]);
    server.emit("regime_update", { symbol, ...regime });

    const ranked = aggregate({
      symbol,
      chart: [...buf.all()],
      htf: [...htfBuf.all()],
      htfTf: "4h",
      regime,
      signalTtlMs: SIGNAL_TTL_MS,
      registry,
      history,
      hasCorrelatedPosition: (sym, dir) => positions.openLike().some((p) => p.symbol !== sym && p.direction === dir),
    });
    if (history.length > 500) history.splice(0, history.length - 500);

    void handleTop(ranked[0]);

    async function handleTop(top: (typeof ranked)[number] | undefined) {
      if (!top) return;
      const sig = top.signal;
      history.push({ symbol: sig.symbol, direction: sig.direction, strategy: sig.strategy, timestamp: sig.timestamp });
      const decision = risk.evaluate(sig, {
        equity,
        peakEquity,
        openPositions: positions.openLike(),
        multiConfirm: multiStrategyConfirm(sig, history, sig.timestamp),
        now: sig.timestamp,
      });
      server.emit("signal_generated", { ...sig, score: top.score, approved: decision.approved, reason: decision.reason });
      console.log(`[signal] ${sig.symbol} ${sig.direction} ${sig.strategy} score=${top.score.toFixed(2)} ` +
        `-> ${decision.approved ? "TAKE" : "REJECT: " + decision.reason}`);
      if (!decision.approved || !decision.positionSize) return;
      try {
        const pos = await executeSignal(exchange, sig, decision.positionSize, { leverage: LEVERAGE });
        positions.add(pos);
        risk.onOpen();
        server.emit("trade_opened", { symbol: pos.symbol, direction: pos.direction, size: pos.size, entry: sig.entryPrice });
        console.log(`[exec] opened ${pos.symbol} ${pos.direction} qty=${pos.size.quantity}`);
      } catch (e) {
        console.error(`[exec] failed ${sig.symbol}:`, e instanceof Error ? e.message : e);
      }
    }
  });

  if (process.env.LIVE === "1") {
    console.log("[agent] bootstrapping historical data...");
    await feed.bootstrap();
    feed.connect();
    console.log("[agent] live feed connected.");
  } else {
    console.log("[agent] started in IDLE mode (set LIVE=1 to connect Binance feed).");
  }
}

main().catch((e) => {
  console.error("[agent] fatal:", e);
  process.exit(1);
});
