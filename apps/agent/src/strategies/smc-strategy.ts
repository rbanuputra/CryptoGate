import type { Candle, Signal, Timeframe } from "@cryptogate/shared";
import { signalId, type ScanContext, type Strategy } from "./base.js";
import { detectSmcSignals, SMC_DEFAULT, type SmcConfig, type SmcSignal } from "./smc-sweep.js";

/** Live adapter: runs SMC detection over the buffer and emits a shared Signal
 *  only when the most recent closed bar produced one (market entry at close). */
export class SmcSweepStrategy implements Strategy {
  readonly name = "smc_sweep" as const;
  constructor(private readonly cfg: SmcConfig = SMC_DEFAULT) {}

  scan(ctx: ScanContext): Signal[] {
    const raw = detectSmcSignals(ctx.chart, ctx.htf, ctx.htfTf, this.cfg);
    const lastBar = ctx.chart.length - 1;
    const fresh = raw.filter((s) => s.barIndex === lastBar);
    const entryPrice = ctx.chart[lastBar]?.close ?? 0;
    return fresh.map((s) => toSignal(s, entryPrice, ctx, this.cfg));
  }
}

/**
 * Backtest adapter for SMC. SMC is stateful (swept levels, cooldown, zone mitigation,
 * market structure), so rescanning a short rolling window re-creates that state from
 * scratch each bar and produces phantom signals: on 2y of BTC a 200-bar window gave
 * 69 signals vs 19 for the full series, while a 1500-bar window (what the live agent's
 * buffer holds) reproduces the full series exactly. This runs the detector ONCE over the
 * whole series (no lookahead: it is causal per bar) and replays signals by bar index, so
 * the backtest matches live behaviour without a 1500-bar rescan on every bar.
 */
export class PrecomputedSmcStrategy implements Strategy {
  readonly name = "smc_sweep" as const;
  /** index (into the full chart) of the bar currently being evaluated; set by the runner */
  cursor = -1;
  private readonly byBar = new Map<number, SmcSignal[]>();

  constructor(
    chart: Candle[],
    htf: Candle[],
    htfTf: Timeframe,
    private readonly cfg: SmcConfig = SMC_DEFAULT,
  ) {
    for (const s of detectSmcSignals(chart, htf, htfTf, cfg)) {
      const arr = this.byBar.get(s.barIndex) ?? [];
      arr.push(s);
      this.byBar.set(s.barIndex, arr);
    }
  }

  scan(ctx: ScanContext): Signal[] {
    const fresh = this.byBar.get(this.cursor);
    if (!fresh) return [];
    const entryPrice = ctx.chart[ctx.chart.length - 1]?.close ?? 0;
    return fresh.map((s) => toSignal(s, entryPrice, ctx, this.cfg));
  }
}

export function toSignal(s: SmcSignal, entryPrice: number, ctx: ScanContext, cfg: SmcConfig): Signal {
  const risk = Math.abs(entryPrice - s.slPrice);
  const tp1 =
    s.direction === "long" ? entryPrice + cfg.tp1Rr * risk : entryPrice - cfg.tp1Rr * risk;
  const tp2 =
    s.direction === "long" ? entryPrice + cfg.tp2Rr * risk : entryPrice - cfg.tp2Rr * risk;
  return {
    id: signalId("smc_sweep", ctx.symbol, s.timestamp),
    strategy: "smc_sweep",
    symbol: ctx.symbol,
    direction: s.direction,
    entryPrice,
    entryType: "market",
    stopLoss: s.slPrice,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: cfg.tp2Rr,
    confidence: s.confidence,
    regime: ctx.regime.regime,
    reasoning: s.reasoning,
    timestamp: s.timestamp,
    expiry: s.timestamp + ctx.signalTtlMs,
    meta: {
      zoneKind: s.zoneKind,
      zoneTop: s.zoneTop,
      zoneBot: s.zoneBot,
      sweptLevel: s.sweptLevel,
      sweptWick: s.sweptWick,
    },
  };
}
