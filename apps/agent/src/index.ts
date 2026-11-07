/**
 * Agent bootstrap. Wires the vertical slice:
 *   DataFeed (15m + 4h) -> on each 15m close -> regime detect -> SMC scan -> log + push.
 *
 * Live data needs outbound access to fapi/fstream.binance.com. Where that is
 * blocked (or no API keys yet), run the backtest CLI instead:
 *   npm run backtest -w @cryptogate/agent -- --symbol BTCUSDT
 */
import type { Timeframe } from "@cryptogate/shared";
import { DataFeed } from "./data/feed.js";
import { detectRegime } from "./regime/detector.js";
import { SmcSweepStrategy } from "./strategies/smc-strategy.js";
import { buildServer, type AgentStatus } from "./server/index.js";

const SYMBOLS = (process.env.SYMBOLS ?? "BTCUSDT,ETHUSDT,SOLUSDT").split(",");
const PORT = Number(process.env.AGENT_PORT ?? 4000);
const SIGNAL_TTL_MS = 30 * 60 * 1000;

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
  const strategy = new SmcSweepStrategy();

  feed.onCandleClose((symbol, tf, buf) => {
    if (tf !== "15m") return;
    const htfBuf = feed.buffer(symbol, "4h");
    if (!htfBuf) return;
    const regime = detectRegime([...htfBuf.all()], [...buf.all()]);
    const signals = strategy.scan({
      symbol,
      chart: [...buf.all()],
      htf: [...htfBuf.all()],
      htfTf: "4h",
      regime,
      signalTtlMs: SIGNAL_TTL_MS,
    });
    server.emit("regime_update", { symbol, ...regime });
    for (const sig of signals) {
      console.log(`[signal] ${sig.symbol} ${sig.direction} ${sig.strategy} @ ${sig.entryPrice} :: ${sig.reasoning}`);
      server.emit("signal_generated", sig);
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
