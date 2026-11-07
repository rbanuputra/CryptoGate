/**
 * Strategy 6: Liquidation Cascade Fade (HIGH_VOLATILITY only, Tier-1).
 * After a mass-liquidation cascade (OI crash + outsized price move + a run of
 * liquidation candles) shows exhaustion (RSI extreme, OI stabilising), fade the
 * first reversal candle. Uses HALF size (meta.positionSizeMultiplier).
 */
import { atr, rsi, type Signal } from "@cryptogate/shared";
import type { ScanContext, Strategy } from "./base.js";
import { buildSignal, lastReal } from "./util.js";

export interface LiquidationFadeConfig {
  oiDropThresholdPct: number;
  priceMoveAtrMult: number;
  cascadeWindowBars: number;
  oiStabilizeThresholdPct: number;
  reversalCandleMinBodyAtr: number;
  minLiquidationCandles: number;
  positionSizeMultiplier: number;
  slAtrMult: number;
  tp1Rr: number;
  tp2Rr: number;
}

export const LIQUIDATION_FADE_DEFAULT: LiquidationFadeConfig = {
  oiDropThresholdPct: 5.0,
  priceMoveAtrMult: 3.0,
  cascadeWindowBars: 8, // ~2h on 15m
  oiStabilizeThresholdPct: 0.5,
  reversalCandleMinBodyAtr: 0.8,
  minLiquidationCandles: 3,
  positionSizeMultiplier: 0.5,
  slAtrMult: 2.0,
  tp1Rr: 1.5,
  tp2Rr: 3.0,
};

export class LiquidationFadeStrategy implements Strategy {
  readonly name = "liquidation_fade" as const;
  constructor(private readonly cfg: LiquidationFadeConfig = LIQUIDATION_FADE_DEFAULT) {}

  scan(ctx: ScanContext): Signal[] {
    const of = ctx.orderflow;
    const cfg = this.cfg;
    const n = ctx.chart.length;
    if (!of || of.oi.length < 3 || n < cfg.cascadeWindowBars + 2) return [];
    const L = n - 1;
    const cur = ctx.chart[L]!;
    const a = lastReal(atr(ctx.chart, 14));
    const rsiNow = lastReal(rsi(ctx.chart.map((c) => c.close), 14));
    if (!(a > 0)) return [];

    // OI crash over the cascade window + stabilising now
    const oiNow = of.oi[of.oi.length - 1]!;
    const oiPrev = of.oi[of.oi.length - 2]!;
    const lookIdx = Math.max(0, of.oi.length - 1 - cfg.cascadeWindowBars);
    const oiThen = of.oi[lookIdx]!;
    const oiDropPct = oiThen > 0 ? ((oiThen - oiNow) / oiThen) * 100 : 0;
    const oiStabilising = oiPrev > 0 ? (Math.abs(oiNow - oiPrev) / oiPrev) * 100 < cfg.oiStabilizeThresholdPct : false;
    if (oiDropPct < cfg.oiDropThresholdPct || !oiStabilising) return [];

    const window = ctx.chart.slice(L - cfg.cascadeWindowBars, L);
    const windowHigh = Math.max(...window.map((c) => c.high));
    const windowLow = Math.min(...window.map((c) => c.low));
    const body = Math.abs(cur.close - cur.open);
    const reds = window.filter((c) => c.close < c.open && Math.abs(c.close - c.open) > a).length;
    const greens = window.filter((c) => c.close > c.open && Math.abs(c.close - c.open) > a).length;

    // DUMP cascade -> long fade
    const dumpMove = windowHigh - cur.low >= cfg.priceMoveAtrMult * a;
    if (dumpMove && reds >= cfg.minLiquidationCandles && rsiNow < 20 && cur.close > cur.open && body > cfg.reversalCandleMinBodyAtr * a) {
      const sl = windowLow - a * cfg.slAtrMult;
      const sig = buildSignal({
        strategy: "liquidation_fade", symbol: ctx.symbol, direction: "long",
        entryPrice: cur.close, stopLoss: sl, tp1Rr: cfg.tp1Rr, tp2Rr: cfg.tp2Rr,
        confidence: 0.7, regime: ctx.regime.regime,
        reasoning: `Dump cascade faded: OI -${oiDropPct.toFixed(1)}%, RSI ${rsiNow.toFixed(0)}, reversal candle`,
        timestamp: cur.openTime, signalTtlMs: ctx.signalTtlMs,
        meta: { positionSizeMultiplier: cfg.positionSizeMultiplier, oiDropPct },
      });
      return sig ? [sig] : [];
    }

    // PUMP cascade -> short fade
    const pumpMove = cur.high - windowLow >= cfg.priceMoveAtrMult * a;
    if (pumpMove && greens >= cfg.minLiquidationCandles && rsiNow > 80 && cur.close < cur.open && body > cfg.reversalCandleMinBodyAtr * a) {
      const sl = windowHigh + a * cfg.slAtrMult;
      const sig = buildSignal({
        strategy: "liquidation_fade", symbol: ctx.symbol, direction: "short",
        entryPrice: cur.close, stopLoss: sl, tp1Rr: cfg.tp1Rr, tp2Rr: cfg.tp2Rr,
        confidence: 0.7, regime: ctx.regime.regime,
        reasoning: `Pump cascade faded: OI -${oiDropPct.toFixed(1)}%, RSI ${rsiNow.toFixed(0)}, reversal candle`,
        timestamp: cur.openTime, signalTtlMs: ctx.signalTtlMs,
        meta: { positionSizeMultiplier: cfg.positionSizeMultiplier, oiDropPct },
      });
      return sig ? [sig] : [];
    }
    return [];
  }
}
