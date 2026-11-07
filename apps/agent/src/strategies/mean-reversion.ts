/**
 * Strategy 3: Mean Reversion.
 * Active in RANGING only. Fade Bollinger extremes with RSI confirmation near
 * the range boundary, requiring a reversal candle and declining (exhaustion) volume.
 */
import { atr, bollinger, rsi, sma, type Candle, type Signal } from "@cryptogate/shared";
import type { ScanContext, Strategy } from "./base.js";
import { buildSignal, lastReal } from "./util.js";

export interface MeanReversionConfig {
  rsiOversold: number;
  rsiOverbought: number;
  bbPeriod: number;
  bbStd: number;
  volumeExhaustionMult: number;
  rangeProximityPct: number;
  slBeyondRangeAtr: number;
  tp1Rr: number;
  tp2Rr: number;
  rangeLookback: number;
}

export const MEAN_REVERSION_DEFAULT: MeanReversionConfig = {
  rsiOversold: 30,
  rsiOverbought: 70,
  bbPeriod: 20,
  bbStd: 2.0,
  volumeExhaustionMult: 0.8,
  rangeProximityPct: 0.2,
  slBeyondRangeAtr: 0.5,
  tp1Rr: 1.5,
  tp2Rr: 2.5,
  rangeLookback: 100,
};

export class MeanReversionStrategy implements Strategy {
  readonly name = "mean_reversion" as const;
  constructor(private readonly cfg: MeanReversionConfig = MEAN_REVERSION_DEFAULT) {}

  scan(ctx: ScanContext): Signal[] {
    const { chart } = ctx;
    const n = chart.length;
    const cfg = this.cfg;
    if (n < cfg.rangeLookback) return [];
    const L = n - 1;
    const cur = chart[L]!;

    const a = lastReal(atr(chart, 14));
    const rsiNow = lastReal(rsi(chart.map((c) => c.close), 14));
    const bb = bollinger(chart.map((c) => c.close), cfg.bbPeriod, cfg.bbStd);
    const band = bb[L]!;
    const volSma = lastReal(sma(chart.map((c) => c.volume), 20));
    if (!(a > 0) || !(volSma > 0) || Number.isNaN(band.upper)) return [];

    const window = chart.slice(-cfg.rangeLookback);
    const rangeHigh = Math.max(...window.map((c) => c.high));
    const rangeLow = Math.min(...window.map((c) => c.low));
    const rangeHeight = rangeHigh - rangeLow;
    if (rangeHeight <= 0) return [];
    const mid = (rangeHigh + rangeLow) / 2;
    const volExhausted = cur.volume < cfg.volumeExhaustionMult * volSma;

    // LONG: oversold, wick below lower band, near range bottom, bullish reversal
    const nearBottom = cur.low <= rangeLow + cfg.rangeProximityPct * rangeHeight;
    if (rsiNow < cfg.rsiOversold && cur.low <= band.lower && nearBottom && cur.close > cur.open && volExhausted) {
      const sl = rangeLow - a * cfg.slBeyondRangeAtr;
      const r = cur.close - sl;
      const tp2Target = cur.close + cfg.tp2Rr * r;
      const tp2 = Math.min(tp2Target, Math.max(mid, cur.close + 0.01)); // range midpoint if closer
      const sig = buildSignal({
        strategy: "mean_reversion", symbol: ctx.symbol, direction: "long",
        entryPrice: cur.close, stopLoss: sl, tp1Rr: cfg.tp1Rr, tp2Rr: cfg.tp2Rr, tp2Override: tp2,
        confidence: 0.65, regime: ctx.regime.regime,
        reasoning: `RSI ${rsiNow.toFixed(0)} oversold at range low ${rangeLow.toPrecision(6)}, reversal candle`,
        timestamp: cur.openTime, signalTtlMs: ctx.signalTtlMs, meta: { rangeLow, rangeHigh },
      });
      return sig ? [sig] : [];
    }
    // SHORT: overbought, wick above upper band, near range top, bearish reversal
    const nearTop = cur.high >= rangeHigh - cfg.rangeProximityPct * rangeHeight;
    if (rsiNow > cfg.rsiOverbought && cur.high >= band.upper && nearTop && cur.close < cur.open && volExhausted) {
      const sl = rangeHigh + a * cfg.slBeyondRangeAtr;
      const r = sl - cur.close;
      const tp2Target = cur.close - cfg.tp2Rr * r;
      const tp2 = Math.max(tp2Target, Math.min(mid, cur.close - 0.01));
      const sig = buildSignal({
        strategy: "mean_reversion", symbol: ctx.symbol, direction: "short",
        entryPrice: cur.close, stopLoss: sl, tp1Rr: cfg.tp1Rr, tp2Rr: cfg.tp2Rr, tp2Override: tp2,
        confidence: 0.65, regime: ctx.regime.regime,
        reasoning: `RSI ${rsiNow.toFixed(0)} overbought at range high ${rangeHigh.toPrecision(6)}, reversal candle`,
        timestamp: cur.openTime, signalTtlMs: ctx.signalTtlMs, meta: { rangeLow, rangeHigh },
      });
      return sig ? [sig] : [];
    }
    return [];
  }
}
