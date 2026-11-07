import type { Signal } from "@cryptogate/shared";
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
